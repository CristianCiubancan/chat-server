import DataLoader from "dataloader";
import { Message } from "../enitities/Message";

export const createMessagesLoader = () =>
  new DataLoader<number, Message[]>(async (chatIds) => {
    const chatIdsToUsers: Record<number, Message[]> = {};
    let mapedChatIds = [];

    for (let chatId of chatIds) {
      mapedChatIds.push({ chatId });
    }
    const messages = await Message.find({
      where: mapedChatIds,
    });
    for (let chatId of chatIds) {
      let chatMessages = [];
      for (let message of messages) {
        if (message.chatId === chatId) {
          chatMessages.push(message);
        }
      }
      chatIdsToUsers[chatId] = chatMessages;
    }
    return chatIds.map((chatId) => chatIdsToUsers[chatId]);
  });
