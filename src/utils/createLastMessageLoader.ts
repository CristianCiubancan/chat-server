import DataLoader from "dataloader";
import { getConnection } from "typeorm";
import { Message } from "../enitities/Message";

export const createLastMessageLoader = () =>
  new DataLoader<number, Message>(
    async (chatIds) => {
      const messages = await getConnection().query(
        `
        SELECT m.* FROM MESSAGE m WHERE m."id" in ( SELECT LAST_MESSAGE FROM ( SELECT "chatId", MAX("id") LAST_MESSAGE FROM MESSAGE WHERE "chatId" in (${chatIds}) GROUP BY "chatId" ) LM );
      `
      );
      const userIdToUser: Record<number, Message> = {};
      messages.forEach((u: Message) => {
        userIdToUser[u.chatId] = u;
      });

      return chatIds.map((chatId) => userIdToUser[chatId]);
    },
    { cache: false }
  );

// `
//   SELECT m.*, ARRAY( SELECT json_build_object( 'id', rn."userId", 'username', rn."username", 'email', rn."email", 'profilePicUrl', rn."profilePicUrl", 'createdAt', rn."createdAt", 'updatedAt', rn."updatedAt" ) FROM ( select r."userId", r."messageId", u.* from reader r inner join "user" u on u.id = r."userId" ) rn WHERE m.id = rn."messageId" ) as readers FROM MESSAGE m WHERE m."createdAt" in ( SELECT LAST_MESSAGE FROM ( SELECT "chatId", MAX("createdAt") LAST_MESSAGE FROM MESSAGE WHERE "chatId" in (${chatIds}) GROUP BY "chatId" ) LM );
// `
