import { Field, ObjectType } from "type-graphql";
import {
  BaseEntity,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { Message } from "./Message";
import { User } from "./User";

@ObjectType()
@Entity()
export class Reader extends BaseEntity {
  @PrimaryColumn()
  userId: number;

  @Field()
  @PrimaryColumn()
  messageId: number;

  @Field(() => User)
  @ManyToOne(() => User, (user) => user.chats, { primary: true })
  @JoinColumn({ name: "userId" })
  reader: User;

  @Field(() => Message)
  @ManyToOne(() => Message, (message) => message.readers, { primary: true })
  @JoinColumn({ name: "messageId" })
  message: Message;

  @Field(() => String)
  @CreateDateColumn()
  createdAt: Date;

  @Field(() => String)
  @UpdateDateColumn()
  updatedAt: Date;
}
