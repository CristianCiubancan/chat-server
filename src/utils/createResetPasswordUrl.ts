import { redis } from "../redis";
import { v4 } from "uuid";
import { FORGET_PASSWORD_PREFIX } from "../constants";

export const createResetPasswordUrl = (userId: number) => {
  const token = v4();
  redis.set(
    FORGET_PASSWORD_PREFIX + token,
    userId,
    "ex",
    1000 * 60 * 60 * 24 * 3
  );

  return `http://localhost:3000/user/reset-password/${token}`;
};
