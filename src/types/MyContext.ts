import { Request, Response } from "express";
import { Session, SessionData } from "express-session";
import { Redis } from "ioredis";
import { createLastMessageLoader } from "src/utils/createLastMessageLoader";
import { createMessagesLoader } from "src/utils/createMessagesLoader";
import { createReaderLoader } from "src/utils/createReaderLoader";
import { createChatsLoader } from "../utils/createChatsLoader";
import { createUsersLoader } from "../utils/createUsersLoader";

export type MyContext = {
  req: Request & {
    session: Session & Partial<SessionData> & { userId?: number };
  };
  redis: Redis;
  res: Response;
  usersLoader: ReturnType<typeof createUsersLoader>;
  chatsLoader: ReturnType<typeof createChatsLoader>;
  messagesLoader: ReturnType<typeof createMessagesLoader>;
  readerLoader: ReturnType<typeof createReaderLoader>;
  lastMessageLoader: ReturnType<typeof createLastMessageLoader>;
};
