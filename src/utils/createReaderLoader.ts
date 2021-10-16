import DataLoader from "dataloader";
import { Reader } from "../enitities/Reader";

export const createReaderLoader = () =>
  new DataLoader<number, Reader[]>(
    async (messageIds) => {
      let mapedMessageIds: { messageId: number }[] = [];

      messageIds.forEach((messageId) => {
        const mapedMesageId = { messageId };
        mapedMessageIds.push(mapedMesageId);
      });

      const readers = await Reader.find({
        where: mapedMessageIds,
        relations: ["reader", "message"],
      });

      const messageIdToReaders: Record<number, Reader[]> = {};
      messageIds.forEach((messageId) => {
        const readersOfMessage: any[] = [];
        for (let reader of readers) {
          if (reader.messageId === messageId) {
            readersOfMessage.push(reader);
          }
        }
        messageIdToReaders[messageId] = readersOfMessage;
      });
      return messageIds.map((key) => messageIdToReaders[key as any]);
    },
    { cache: false }
  );
