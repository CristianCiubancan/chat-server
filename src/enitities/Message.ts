import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BaseEntity,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { ObjectType, Field, ID } from "type-graphql";
import { Chat } from "./Chat";
import { Reader } from "./Reader";

@ObjectType()
@Entity()
export class Message extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id: number;

  @Field()
  @Column()
  senderId: number;

  @Field()
  @Column()
  text: string;

  @Field()
  @Column()
  chatId: number;

  @ManyToOne(() => Chat, (chat) => chat.messages)
  chat: Chat;

  @OneToMany(() => Reader, (reader) => reader.reader)
  readers: Reader[];

  @Field(() => String)
  @CreateDateColumn()
  createdAt: Date;

  @Field(() => String)
  @UpdateDateColumn()
  updatedAt: Date;
}
