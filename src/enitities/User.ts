import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BaseEntity,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { ObjectType, Field } from "type-graphql";
import { ChatMembers } from "./ChatMembers";
import { Reader } from "./Reader";

@ObjectType()
@Entity()
export class User extends BaseEntity {
  @Field()
  @PrimaryGeneratedColumn()
  id!: number;

  @Field()
  @Column({ unique: true })
  username!: string;

  @Field()
  @Column({ unique: true })
  email!: string;

  @Field()
  @Column({
    default:
      "https://chat-images-bucket.s3.eu-north-1.amazonaws.com/0/profilePic/load.jpg",
  })
  profilePicUrl: string;

  @Column()
  password!: string;

  @Field(() => String)
  @CreateDateColumn()
  createdAt: Date;

  @Field(() => String)
  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => ChatMembers, (chatmembers) => chatmembers.user)
  chats: ChatMembers[];

  @OneToMany(() => Reader, (reader) => reader.reader)
  readMessages: Reader[];
}
