import "reflect-metadata";
import "dotenv-safe/config";
import path from "path";
import { createConnection } from "typeorm";
import ws from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { redis } from "./redis";
import { buildSchema } from "type-graphql";
import express from "express";
import connectRedis from "connect-redis";
import session, { Session, SessionData } from "express-session";
import cors from "cors";
import { COOKIE_NAME, __prod__ } from "./constants";
import { ApolloServer } from "apollo-server-express";
import { MyContext } from "./types/MyContext";
import { createUsersLoader } from "./utils/createUsersLoader";
import { createChatsLoader } from "./utils/createChatsLoader";
import { createMessagesLoader } from "./utils/createMessagesLoader";
import { createReaderLoader } from "./utils/createReaderLoader";
import { createLastMessageLoader } from "./utils/createLastMessageLoader";
import { graphqlUploadExpress } from "graphql-upload";
import { User } from "./enitities/User";
import { Chat } from "./enitities/Chat";
import { ChatMembers } from "./enitities/ChatMembers";
import { Message } from "./enitities/Message";
import { Reader } from "./enitities/Reader";
import { UserResolver } from "./resolvers/user";
import { ChatResolver } from "./resolvers/chat";
import { MessageResolver } from "./resolvers/message";
import { RedisPubSub } from "graphql-redis-subscriptions";

const main = async () => {
  const conn = await createConnection({
    type: "postgres",
    url: process.env.DATABASE_URL,
    logging: false,
    ssl: __prod__ ? { rejectUnauthorized: false } : false,
    synchronize: true,
    migrations: [path.join(__dirname, "./migrations/*")],
    entities: [User, Chat, ChatMembers, Message, Reader],
  });

  await conn.runMigrations();

  const pubSub = new RedisPubSub({
    connection: process.env.REDIS_URL as any,
  });

  const schema = await buildSchema({
    resolvers: [UserResolver, ChatResolver, MessageResolver],
    pubSub,
  });

  const app = express();
  const RedisStore = connectRedis(session);

  const redisClient = redis;

  app.set("trust proxy", 1);

  app.use(
    cors({
      origin: process.env.CORS_ORIGIN, //asa obijnuia sa fie
      credentials: true,
    })
  );

  const sessionMiddleware = session({
    store: new RedisStore({
      client: redisClient,
      disableTouch: true,
    }),
    name: COOKIE_NAME,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: __prod__, //cookie only works in https
      domain: __prod__ ? ".happyoctopus.net" : undefined, //de scos secure false si de folosit ce e comentat
      maxAge: 1000 * 60 * 60 * 24 * 365 * 10, //10 years
    },
  } as any);

  app.use(sessionMiddleware);

  const apolloServer = new ApolloServer({
    schema,
    context: ({ req, res }: MyContext) => ({
      req,
      res,
      redis,
      usersLoader: createUsersLoader(),
      chatsLoader: createChatsLoader(),
      messagesLoader: createMessagesLoader(),
      readerLoader: createReaderLoader(),
      lastMessageLoader: createLastMessageLoader(),
    }),
  });

  app.use(graphqlUploadExpress({ maxFileSize: 10000000, maxFiles: 10 }));
  app.use("/images", express.static(path.join(__dirname, "../images")));
  app.use("/sounds", express.static(path.join(__dirname, "../sounds")));

  await apolloServer.start();
  apolloServer.applyMiddleware({
    app,
    cors: false,
  });

  const server = app.listen(parseInt(process.env.PORT), () => {
    const wsServer = new ws.Server({
      server,
      path: "/graphql",
    });

    useServer(
      {
        schema,
        context: async (ctx: any) => {
          const promise = new Promise((resolve) => {
            const req = ctx.extra.request as express.Request & {
              session: Session & Partial<SessionData> & { userId?: number };
            };
            const res = {} as any as express.Response;
            sessionMiddleware(req, res, (_: any) => {
              return resolve({ req, res });
            });
          });
          const { req, res } = (await promise) as any;
          return {
            req,
            res,
            redis,
            usersLoader: createUsersLoader(),
            chatsLoader: createChatsLoader(),
            messagesLoader: createMessagesLoader(),
            readerLoader: createReaderLoader(),
            lastMessageLoader: createLastMessageLoader(),
          };
        },
        // onConnect: (ctx) => {
        //   console.log("Connect", ctx);
        // },
        // onSubscribe: (ctx, msg) => {
        //   console.log("Subscribe", { ctx, msg });
        // },
        // onNext: (ctx, msg, args, result) => {
        //   const { payload } = msg;
        //   // console.debug("Next", { ctx, msg, args, result });
        //   console.log(payload);
        // },
        // onError: (ctx, msg, errors) => {
        //   console.error("Error", { ctx, msg, errors });
        // },
        // onComplete: (ctx, msg) => {
        //   console.log("Complete", { ctx, msg });
        // },
      },
      wsServer
    );
    console.log(
      `🚀 Graphql server ready at http://localhost:4000${apolloServer.graphqlPath}`
    );
  });
};

main();
