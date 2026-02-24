import { MongoClient } from "mongodb";
import type { GameSessionStore, PersistedGameSession } from "@/bot/application/ports/game-session-store";

type MongoGameSessionStoreOptions = {
  uri: string;
  dbName: string;
  collectionName?: string;
};

export class MongoGameSessionStore implements GameSessionStore {
  private readonly client: MongoClient;
  private readonly dbName: string;
  private readonly collectionName: string;

  constructor(options: MongoGameSessionStoreOptions) {
    this.client = new MongoClient(options.uri);
    this.dbName = options.dbName;
    this.collectionName = options.collectionName ?? "game_sessions";
  }

  async findByChatId(chatId: number): Promise<PersistedGameSession | null> {
    const collection = await this.getCollection();
    const doc = await collection.findOne({ chatId });
    if (!doc) {
      return null;
    }

    return {
      ...doc,
      updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt : new Date(doc.updatedAt),
    };
  }

  async save(session: PersistedGameSession): Promise<void> {
    const collection = await this.getCollection();
    await collection.updateOne(
      { chatId: session.chatId },
      { $set: session },
      { upsert: true },
    );
  }

  async deleteByChatId(chatId: number): Promise<void> {
    const collection = await this.getCollection();
    await collection.deleteOne({ chatId });
  }

  private async getCollection() {
    await this.client.connect();
    return this.client
      .db(this.dbName)
      .collection<PersistedGameSession>(this.collectionName);
  }
}
