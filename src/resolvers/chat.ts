import { User } from "../enitities/User";
import { MyContext } from "../types/MyContext";
import {
  Arg,
  Ctx,
  Field,
  FieldResolver,
  InputType,
  Int,
  Mutation,
  PubSub,
  PubSubEngine,
  Query,
  Resolver,
  Root,
  Subscription,
  UseMiddleware,
} from "type-graphql";
import { Chat } from "../enitities/Chat";
import { Message } from "../enitities/Message";
import { ChatMembers } from "../enitities/ChatMembers";
import { UserInputError } from "apollo-server-express";
import { isAuth } from "../middleware/isAuth";
import { isMember } from "../utils/isMember";
import { getConnection } from "typeorm";
// import { getConnection } from "typeorm";

@InputType()
export class MemberIdsInput {
  @Field()
  id: number;
}

@Resolver(Chat)
export class ChatResolver {
  @FieldResolver(() => [User])
  async members(@Root() chat: Chat, @Ctx() { usersLoader }: MyContext) {
    return await usersLoader.load(chat.id);
  }

  @FieldResolver(() => Message)
  async lastMessage(
    @Root() chat: Chat,
    @Ctx() { lastMessageLoader }: MyContext
  ) {
    // const lastMessage = await Message.find({
    //   where: {
    //     chatId: chat.id,
    //   },
    //   // relations: ["readers"],
    //   order: {
    //     createdAt: "DESC",
    //   },
    // });
    // return lastMessage[0];
    // ===================================================================================
    // const messages = await getConnection().query(
    //   `
    //     SELECT m.* FROM MESSAGE m WHERE m."id" in ( SELECT LAST_MESSAGE FROM ( SELECT "chatId", MAX("id") LAST_MESSAGE FROM MESSAGE WHERE "chatId" in (${chat.id}) GROUP BY "chatId" ) LM );
    //   `
    // );
    // console.log(messages);
    // return messages[0];
    // ===================================================================================
    const lastMessage = await lastMessageLoader.load(chat.id);
    return lastMessage;
  }

  @FieldResolver(() => [Message], { nullable: true })
  async messages(@Root() chat: Chat, @Ctx() { messagesLoader }: MyContext) {
    return await messagesLoader.load(chat.id);
  }

  @Query(() => [User])
  async getUsers(@Ctx() { req }: MyContext): Promise<User[]> {
    const users = await getConnection().query(
      `
        select * from "user" ${
          req.session.userId ? `where id <> ${req.session.userId}` : ""
        };
      `
    );

    return users;
  }

  @Subscription(() => Chat, {
    topics: "NEWMESSAGE",
    filter: async ({ payload, context }) => {
      if (
        context.req.session.userId &&
        (await isMember(context.req.session.userId, payload.chatId))
      ) {
        return true;
      } else {
        return false;
      }
    },
  })
  async newMessagesSentToChat(
    @Root() newMessagePayload: Message
  ): Promise<Chat> {
    const chat = await Chat.findOne({
      where: {
        id: newMessagePayload.chatId,
      },
    });
    return chat as Chat;
  }

  @Subscription(() => Chat, {
    topics: "NEWREADMESSAGE",
    filter: async ({ payload, context }) => {
      if (
        context.req.session.userId &&
        context.req.session.userId !== payload.senderId &&
        (await isMember(context.req.session.userId, payload.chatId))
      ) {
        return true;
      } else {
        return false;
      }
    },
  })
  async newReadMessage(@Root() newMessagePayload: Message): Promise<Chat> {
    const chat = await Chat.findOne({
      where: {
        id: newMessagePayload.chatId,
      },
    });
    return chat!;
  }

  @Query(() => Chat, { nullable: true })
  @UseMiddleware(isAuth)
  async getChat(
    @Arg("id", () => Int) id: number,
    @PubSub() pubSub: PubSubEngine,
    @Ctx() { req }: MyContext
  ) {
    if (await isMember(req.session.userId!, id)) {
      const chatAtHand = await Chat.findOne({ where: { id } });
      await pubSub.publish("MESSAGESREAD", chatAtHand);
      return chatAtHand;
    }
    throw new UserInputError("not authenticated");
  }

  @Query(() => [Chat])
  @UseMiddleware(isAuth)
  async getUserChats(@Ctx() { req }: MyContext): Promise<Chat[]> {
    const userChats = await getConnection().query(
      `
      SELECT m."createdAt", m."chatId" FROM MESSAGE m WHERE m."id" in ( SELECT LAST_MESSAGE FROM ( SELECT "chatId", MAX("id") LAST_MESSAGE FROM MESSAGE WHERE "chatId" in (select "chatId" from chat_members where "memberId"=${req.session.userId}) GROUP BY "chatId" ) LM );
      `
    );
    userChats.sort((a: any, b: any) => {
      return b.createdAt - a.createdAt;
    });

    const sortedChats = userChats.map((chat: any) => {
      return {
        id: chat.chatId,
      } as Chat;
    });
    return sortedChats ? sortedChats : [];
  }

  @Query(() => [Chat])
  @UseMiddleware(isAuth)
  async getChats(@Ctx() { req }: MyContext): Promise<Chat[]> {
    let mapedChatMemberToChatIds = [];
    const chatMembers = await ChatMembers.find({
      where: {
        memberId: req.session.userId,
      },
    });
    for (let member of chatMembers) {
      mapedChatMemberToChatIds.push({ id: member.chatId });
    }
    const chats = await Chat.find({
      where: mapedChatMemberToChatIds,
    });
    return chats;
  }

  @Mutation(() => Chat)
  async createChat(
    @Arg("initiatorId") initiatorId: number,
    @Arg("otherMemberId") otherMemberId: number
  ): Promise<Chat | null> {
    if (initiatorId === otherMemberId) {
      throw new UserInputError("Invalid argument value");
    }
    const userChats = await ChatMembers.find({
      where: { memberId: initiatorId },
    });

    let existingChat;
    let chatToReturn;
    for (let uc of userChats) {
      const chatMembers = await ChatMembers.find({
        where: {
          chatId: uc.chatId,
        },
      });
      for (let cm of chatMembers) {
        if (cm.memberId === otherMemberId) {
          existingChat = cm.chatId;
        }
      }
    }

    if (existingChat) {
      chatToReturn = await Chat.findOne({
        where: {
          id: existingChat,
        },
      });
    } else {
      chatToReturn = await Chat.create().save();
      await ChatMembers.create({
        chatId: chatToReturn.id,
        memberId: initiatorId,
      }).save();

      await ChatMembers.create({
        chatId: chatToReturn.id,
        memberId: otherMemberId,
      }).save();
    }

    return chatToReturn!;
  }
}
