import DataLoader from "dataloader";
import { Chat } from "../enitities/Chat";
import { ChatMembers } from "../enitities/ChatMembers";

export const createChatsLoader = () =>
  new DataLoader<number, Chat[]>(async (userIds) => {
    // const qbChats = await qb
    //   .innerJoinAndSelect("chat.members", "cm")
    //   .where(
    //     "chat.id IN" +
    //       qb
    //         .subQuery()
    //         .select('chat_members."chatId"')
    //         .from(ChatMembers, "chat_members")
    //         .where(`chat_members."memberId" in (${userIds})`)
    //         .getQuery()
    //   )
    //   .getMany();

    const userIdToChat: Record<number, Chat[]> = {};

    let mapedUserIds: { memberId: number }[] = [];

    userIds.forEach((userId) => {
      const mapedUserId = { memberId: userId };
      mapedUserIds.push(mapedUserId);
    });

    const chatMembers = await ChatMembers.find({
      where: mapedUserIds,
    });

    let mapedChatIds: { id: number }[] = [];

    chatMembers.forEach((member) => {
      const mapedChatId = { id: member.chatId };
      mapedChatIds.push(mapedChatId);
    });

    const chats = await Chat.find({
      where: mapedChatIds,
    });

    userIds.forEach((userId) => {
      let chatIdsOfUser = [];
      let userChats = [];
      for (let chat of chatMembers) {
        if (chat.memberId === userId) {
          chatIdsOfUser.push(chat.chatId);
        }
      }
      for (let chatId of chatIdsOfUser) {
        for (let chat of chats) {
          if (chatId === chat.id) {
            userChats.push(chat);
          }
        }
      }
      userIdToChat[userId] = userChats;
    });

    return userIds.map((memberId) => userIdToChat[memberId]);
  });
