import type { DeveloperAccount, PublicDeveloperProfile } from '../types/auth.ts';
import { dbService } from '../services/dbService.ts';

export const userStore = {
  /**
   * Find developer account by email address (case-insensitive)
   */
  async findByEmail(email: string): Promise<DeveloperAccount | null> {
    return await dbService.findUserByEmail(email);
  },

  /**
   * Find developer account by unique ID
   */
  async findById(id: string): Promise<DeveloperAccount | null> {
    return await dbService.findUserById(id);
  },

  /**
   * Creates a new developer account with hashed password
   */
  async create(data: {
    name: string;
    email: string;
    passwordHash: string;
  }): Promise<DeveloperAccount> {
    return await dbService.createUser(data);
  },

  /**
   * Strips passwordHash and returns public developer profile
   */
  toPublicProfile(user: DeveloperAccount): PublicDeveloperProfile {
    const { passwordHash, ...publicData } = user;
    return publicData;
  },
};
