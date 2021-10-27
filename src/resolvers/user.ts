import { User } from "../enitities/User";
import {
  Resolver,
  Query,
  Mutation,
  Arg,
  Field,
  ObjectType,
  Ctx,
  FieldResolver,
  Root,
  Int,
  Subscription,
} from "type-graphql";
import sharp from "sharp";
import argon2 from "argon2";
import { validateRegsiter } from "../utils/validateRegister";
import { MyContext } from "../types/MyContext";
import { sendEmail } from "../utils/sendEmail";
import { COOKIE_NAME, FORGET_PASSWORD_PREFIX } from "../constants";
import { Chat } from "../enitities/Chat";
import { UsernamePasswordInput } from "./UsernamePasswordInput";
import { getConnection } from "typeorm";
import { v4 } from "uuid";
import { FileUpload, GraphQLUpload } from "graphql-upload";
import { S3 } from "aws-sdk";
import stream2buffer from "../utils/stream2buffer";
import groupBy from "../utils/groupArrOfObjByValueOrKey";
import { isMember } from "../utils/isMember";

const s3 = new S3({
  region: process.env.AWS_BUCKET_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
});

@ObjectType()
class FieldError {
  @Field()
  field: string;
  @Field()
  message: string;
}

class DBNotification {
  messageId: number;
  chatId: number;
  senderId: number;
  userId: number;
}

@ObjectType()
class NotificationPublish {
  @Field()
  messageId: number;
  @Field()
  chatId: number;
  @Field()
  senderId: number;
  @Field()
  add: boolean;
}

@ObjectType()
class UserResponse {
  @Field(() => [FieldError], { nullable: true })
  errors?: FieldError[];
  @Field(() => User, { nullable: true })
  user?: User;
}

@Resolver(User)
export class UserResolver {
  @FieldResolver(() => [Chat])
  async chats(@Root() user: User, @Ctx() { chatsLoader }: MyContext) {
    return await chatsLoader.load(user.id);
  }

  @FieldResolver(() => String)
  email(@Root() user: User, @Ctx() { req }: MyContext) {
    if (req.session.userId === user.id) {
      return user.email;
    }
    return "";
  }

  @Subscription(() => NotificationPublish, {
    topics: "NEWNOTIFICATION",
    filter: async ({ payload, context }) => {
      if (payload.add === true) {
        if (
          context.req.session.userId &&
          (await isMember(context.req.session.userId, payload.chatId)) &&
          payload.senderId !== context.req.session.userId
        ) {
          return true;
        } else {
          return false;
        }
      } else {
        if (
          context.req.session.userId &&
          (await isMember(context.req.session.userId, payload.chatId)) &&
          payload.senderId === context.req.session.userId
        ) {
          return true;
        } else {
          return false;
        }
      }
    },
  })
  async newNotificationReceived(
    @Root() newNotificationPayload: any // actually a message with some extra field
  ): Promise<NotificationPublish> {
    const newNotification = {
      messageId: newNotificationPayload.id,
      chatId: newNotificationPayload.chatId,
      senderId: newNotificationPayload.senderId,
      add: newNotificationPayload.add,
    };
    return newNotification;
  }

  @Query(() => [NotificationPublish], { nullable: true })
  async userNotifications(@Ctx() { req }: MyContext) {
    if (!req.session.userId) {
      return null;
    }

    const notifications = await getConnection().query(
      `select t1.id "messageId", t1."chatId", reader."userId", t1."senderId" from message as t1 join (select "chatId", max("createdAt") last_message from message where "chatId" in (select "chatId" from chat_members where "memberId"=${req.session.userId}) group by "chatId") as t2 on t2.last_message = t1."createdAt" join reader on reader."messageId" = t1.id;`
    );

    const groupedNotification = Object.entries(
      groupBy("messageId")(notifications)
    ).map(([a, b]) => {
      return { [a]: b };
    });

    let newNotifications = [];

    for (let obj in groupedNotification) {
      const currentChat: Array<Object> = Object.values(
        groupedNotification[obj]
      )[0] as Object[];
      let isChatReadByMe = false;
      for (let person in currentChat as DBNotification[]) {
        const reader = currentChat[person] as DBNotification;
        if (reader.userId === req.session.userId) {
          isChatReadByMe = true;
        }
      }
      if (!isChatReadByMe) {
        newNotifications.push(currentChat[0]);
      }
    }

    if (newNotifications.length === 0) {
      return null;
    }
    return newNotifications;
  }

  @Mutation(() => String)
  async changeProfilePic(
    @Arg("picture", () => GraphQLUpload) file: FileUpload,
    @Ctx() { req }: MyContext
  ) {
    if (!file.filename) {
      return false;
    }

    const picBuffer = await stream2buffer(file.createReadStream());

    const resizedPic = await sharp(picBuffer)
      .resize({
        fit: sharp.fit.contain,
        width: 350,
      })
      .rotate()
      .webp({ quality: 70 })
      .toBuffer();

    const getUploadedImages = await s3
      .listObjects({
        Bucket: process.env.AWS_BUCKET_NAME,
        Prefix: `${req.session.userId}`,
      })
      .promise();

    if (getUploadedImages.Contents) {
      for (let image of getUploadedImages.Contents!) {
        await s3
          .deleteObject({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: image.Key as string,
          })
          .promise();
      }
    }

    const newProfilePic = await s3
      .upload({
        Bucket: process.env.AWS_BUCKET_NAME,
        Body: resizedPic as Buffer,
        Key: `${req.session.userId}/profilePic/${file.filename}`,
        ContentType: file.mimetype,
        BucketKeyEnabled: true,
        ACL: "public-read",
      })
      .promise();

    await User.update(req.session.userId!, {
      profilePicUrl: newProfilePic.Location,
    });
    return newProfilePic.Location;
  }

  @Mutation(() => UserResponse)
  async changePassword(
    @Arg("token") token: string,
    @Arg("newPassword") newPassword: string,
    @Ctx() { redis, req }: MyContext
  ): Promise<UserResponse> {
    if (newPassword.length <= 6) {
      return {
        errors: [
          {
            field: "newPassword",
            message: "length must be greater than 6",
          },
        ],
      };
    }

    const key = FORGET_PASSWORD_PREFIX + token;
    const userId = await redis.get(key);
    if (!userId) {
      return {
        errors: [
          {
            field: "token",
            message: "token expired",
          },
        ],
      };
    }
    const userIdNum = parseInt(userId);
    const user = await User.findOne(userIdNum);

    if (!user) {
      return {
        errors: [
          {
            field: "token",
            message: "user no longer exists",
          },
        ],
      };
    }

    await User.update(
      { id: userIdNum },
      {
        password: await argon2.hash(newPassword),
      }
    );

    await redis.del(key);
    //login user after password update
    req.session.userId = user.id;

    return { user };
  }

  @Mutation(() => Boolean)
  async forgotPassword(
    @Arg("email") email: string,
    @Ctx() { redis }: MyContext
  ) {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return true;
    }

    const token = v4();

    await redis.set(
      FORGET_PASSWORD_PREFIX + token,
      user.id,
      "ex",
      1000 * 60 * 60 * 24 * 3
    );

    await sendEmail(
      email,
      "forgotten password",
      `<a href="${process.env.CORS_ORIGIN}/change-password/${token}">reset password</a>`
    );
    return true;
  }

  @Query(() => User, { nullable: true })
  me(@Ctx() { req }: MyContext) {
    if (!req.session.userId) {
      return null;
    }

    return User.findOne(req.session.userId);
  }

  @Query(() => User, { nullable: true })
  getUser(@Arg("userId", () => Int) userId: number) {
    return User.findOne({ where: { id: userId } });
  }

  @Mutation(() => UserResponse)
  async register(
    @Arg("options") options: UsernamePasswordInput,
    @Ctx() { req }: MyContext
  ): Promise<UserResponse> {
    const errors = validateRegsiter(options);
    if (errors) {
      return { errors };
    }

    const hashedPassword = await argon2.hash(options.password);
    let user;
    try {
      const result = await getConnection()
        .createQueryBuilder()
        .insert()
        .into(User)
        .values({
          username: options.username,
          email: options.email,
          password: hashedPassword,
        })
        .returning("*")
        .execute();
      user = result.raw[0];
    } catch (err) {
      if (err.code === "23505") {
        //|| err.detail.includes("already exists")
        //duplicate username error
        if (err.detail.includes("email")) {
          return {
            errors: [
              {
                field: "email",
                message: "email is already taken",
              },
            ],
          };
        } else if (err.detail.includes("username")) {
          return {
            errors: [
              {
                field: "username",
                message: "username is already taken",
              },
            ],
          };
        }
      }
    }
    //store userid session this will set a cookie on the user to keep them logged in
    req.session.userId = user.id;
    return { user };
  }
  @Mutation(() => UserResponse)
  async login(
    @Arg("usernameOrEmail") usernameOrEmail: string,
    @Arg("password") password: string,
    @Ctx() { req }: MyContext
  ): Promise<UserResponse> {
    const user = await User.findOne(
      usernameOrEmail.includes("@")
        ? { where: { email: usernameOrEmail } }
        : { where: { username: usernameOrEmail } }
    );
    if (!user) {
      return {
        errors: [
          {
            field: "usernameOrEmail",
            message: "username doesn't exist",
          },
        ],
      };
    }

    const valid = await argon2.verify(user.password, password);
    if (!valid) {
      return {
        errors: [
          {
            field: "password",
            message: "password doesn't match",
          },
        ],
      };
    }

    req.session.userId = user.id;
    return {
      user,
    };
  }

  @Mutation(() => Boolean)
  logout(@Ctx() { req, res }: MyContext) {
    return new Promise((resolve) =>
      req.session.destroy((err) => {
        res.clearCookie(COOKIE_NAME);
        if (err) {
          resolve(false);
          return;
        }
        resolve(true);
      })
    );
  }
}
