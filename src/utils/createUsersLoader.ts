import DataLoader from "dataloader";
import { ChatMembers } from "../enitities/ChatMembers";
import { User } from "../enitities/User";

export const createUsersLoader = () =>
  new DataLoader<number, User[]>(async (chatIds) => {
    const chatIdToMembers: Record<number, User[]> = {};

    let mapedChatIds: { chatId: number }[] = [];

    chatIds.forEach((chatId) => {
      const mapedChatId = { chatId };
      mapedChatIds.push(mapedChatId);
    });

    const chatMembers = await ChatMembers.find({
      where: mapedChatIds,
    });

    let mapedUserIds: { id: number }[] = [];

    chatMembers.forEach((member) => {
      const mapedUserId = { id: member.memberId };
      mapedUserIds.push(mapedUserId);
    });

    const users = await User.find({
      where: mapedUserIds,
    });

    chatIds.forEach((chatId) => {
      let usersOfChatId = [];
      let userChats = [];
      for (let user of chatMembers) {
        if (user.chatId === chatId) {
          usersOfChatId.push(user.memberId);
        }
      }
      for (let userId of usersOfChatId) {
        for (let user of users) {
          if (userId === user.id) {
            userChats.push(user);
          }
        }
      }
      chatIdToMembers[chatId] = userChats;
    });
    return chatIds.map((chatId) => chatIdToMembers[chatId]);
  });
