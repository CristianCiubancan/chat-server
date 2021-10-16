import { ChatMembers } from "../enitities/ChatMembers";

export const isMember = async (userId: number, chatId: number) => {
  const chatMembers = await ChatMembers.find({
    where: {
      chatId: chatId,
    },
  });
  let memberOfChat: ChatMembers | undefined = undefined;
  for (let member of chatMembers) {
    if (member.memberId === userId) {
      memberOfChat = member;
    }
  }
  if (memberOfChat) {
    return true;
  } else {
    return false;
  }
};
