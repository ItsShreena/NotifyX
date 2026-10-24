import { request } from './apiClient';

export interface ChannelPreferences {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
}

export interface CategoryPreferenceItem {
  category: string;
  label: string;
  description: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
  updatedAt: string;
}

export interface UserPreferencesResponse {
  channels: ChannelPreferences;
  categories: CategoryPreferenceItem[];
}

export const preferenceService = {
  /**
   * Retrieves the authenticated user's notification preferences:
   * Global channels + 9 individual categories.
   */
  async getUserPreferences(): Promise<UserPreferencesResponse> {
    const response = await request<{
      success: boolean;
      channels: ChannelPreferences;
      categories: CategoryPreferenceItem[];
    }>('/api/preferences');

    return {
      channels: response.channels,
      categories: response.categories,
    };
  },

  /**
   * Updates global channels toggle (In-App, Email, Push).
   */
  async updateGlobalChannels(data: Partial<ChannelPreferences>): Promise<ChannelPreferences> {
    const response = await request<{
      success: boolean;
      channels: ChannelPreferences;
      message: string;
    }>('/api/preferences/channels', {
      method: 'PUT',
      body: JSON.stringify(data),
    });

    return response.channels;
  },

  /**
   * Updates channel toggles for a specific notification category.
   */
  async updateCategory(
    category: string,
    data: Partial<ChannelPreferences>
  ): Promise<CategoryPreferenceItem> {
    const response = await request<{
      success: boolean;
      preference: CategoryPreferenceItem;
      message: string;
    }>(`/api/preferences/${category}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });

    return response.preference;
  },
};
