import { isAuth } from "../middleware/isAuth";
import {
  Arg,
  Ctx,
  Field,
  FieldResolver,
  InputType,
  Int,
  Mutation,
  ObjectType,
  PubSub,
  PubSubEngine,
  Query,
  Resolver,
  Root,
  Subscription,
  UseMiddleware,
} from "type-graphql";
import { Message, ReadersInfo } from "../enitities/Message";
import { MyContext } from "../types/MyContext";
import { Reader } from "../enitities/Reader";
import { getConnection } from "typeorm";

@InputType()
class MessageInput {
  @Field()
  text: string;
  @Field(() => Int)
  chatId: number;
}

@ObjectType()
class PaginatedMessages {
  @Field(() => [Message])
  messages: Message[];
  @Field()
  hasMore: boolean;
}

@Resolver(Message)
export class MessageResolver {
  @FieldResolver(() => [Reader])
  async readers(@Root() message: Message, @Ctx() { readerLoader }: MyContext) {
    return await readerLoader.load(message.id);
  }

  @FieldResolver(() => ReadersInfo)
  async readersInfo(
    @Root() message: Message,
    @Ctx() { readerLoader }: MyContext
  ) {
    return {
      id: message.id,
      readers: await readerLoader.load(message.id),
    };
  }

  @Subscription(() => Message, {
    topics: "NEWMESSAGE",
    filter: async ({ payload, args, context }) => {
      if (payload.chatId === args.chatId && context.req.session.userId) {
        return true;
      } else {
        return false;
      }
    },
  })
  async newChatMessage(
    @Root() newMessagePayload: Message,
    @Arg("chatId", () => Int) _chatId: number
  ): Promise<Message> {
    return newMessagePayload;
  }

  @Query(() => PaginatedMessages, { nullable: true })
  @UseMiddleware(isAuth)
  async getMessages(
    @Arg("limit", () => Int) limit: number,
    @Arg("cursor", () => String, { nullable: true }) cursor: string | null,
    @Arg("chatId", () => Int) chatId: number
  ): Promise<PaginatedMessages> {
    const realLimitPlusOne = limit + 1;
    const replacements: any[] = [realLimitPlusOne, chatId];

    if (cursor) {
      replacements.push(new Date(parseInt(cursor)));
    }

    const posts = await getConnection().query(
      `
    select m.* 
    from message m
    where m."chatId" = $2
    ${cursor ? `and m."createdAt" < $3` : ""}
    order by m."createdAt" DESC
    limit $1
    `,
      replacements
    );

    return {
      messages: posts.slice(0, limit),
      hasMore: posts.length === realLimitPlusOne,
    };
  }

  @Mutation(() => Message)
  @UseMiddleware(isAuth)
  async sendMessage(
    @Arg("input") input: MessageInput,
    @Ctx() { req }: MyContext,
    @PubSub() pubSub: PubSubEngine
  ): Promise<Message> {
    const message = await Message.create({
      chatId: input.chatId,
      text: input.text,
      senderId: req.session.userId,
    }).save();

    // const existingReader = await Reader.findOne({
    //   where: { messageId: message.id, userId: req.session.userId },
    // });
    // if (existingReader) {
    //   return message;
    // }

    await Reader.create({
      messageId: message.id,
      userId: req.session.userId,
    }).save();

    const notificationPublish = { ...message, add: true };

    await pubSub.publish("NEWNOTIFICATION", notificationPublish);
    await pubSub.publish("NEWMESSAGE", message);

    return message;
  }

  @Mutation(() => Boolean)
  @UseMiddleware(isAuth)
  async readChatMessages(
    @Ctx() { req }: MyContext,
    @Arg("messageId", () => Int) messageId: number,
    @PubSub() pubSub: PubSubEngine
  ): Promise<Boolean> {
    const existingReader = await Reader.findOne({
      where: { messageId: messageId, userId: req.session.userId },
    });

    if (existingReader) {
      return true;
    }

    await Reader.create({
      messageId: messageId,
      userId: req.session.userId,
    }).save();
    const message = await Message.findOne({ where: { id: messageId } });

    await pubSub.publish("NEWREADMESSAGE", message);
    await pubSub.publish("NEWNOTIFICATION", {
      id: messageId,
      chatId: message?.chatId,
      senderId: req.session.userId,
      add: false,
    });
    return true;
  }
}
