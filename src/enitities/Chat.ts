import { Entity, PrimaryGeneratedColumn, BaseEntity, OneToMany } from "typeorm";
import { ObjectType, Field, ID } from "type-graphql";
import { ChatMembers } from "./ChatMembers";
import { Message } from "./Message";

@ObjectType()
@Entity()
export class Chat extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id: number;

  @OneToMany(() => ChatMembers, (chatmembers) => chatmembers.chat)
  members: ChatMembers[];

  @Field(() => Message, {
    nullable: true,
  })
  lastMessage: Message;

  @OneToMany(() => Message, (message) => message.chat, {
    nullable: true,
  })
  messages: Message[];
}
