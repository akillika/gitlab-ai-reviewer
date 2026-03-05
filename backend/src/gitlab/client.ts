import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

export function createGitLabClient(baseUrl: string, accessToken: string): AxiosInstance {
  const client = axios.create({
    baseURL: `${baseUrl}/api/v4`,
    headers: {
      'PRIVATE-TOKEN': accessToken,
    },
    timeout: 30000,
  });

  client.interceptors.response.use(
    (response) => response,
    (error) => {
      if (axios.isAxiosError(error)) {
        logger.error('GitLab API error', {
          status: error.response?.status,
          url: error.config?.url,
          method: error.config?.method,
        });
      }
      return Promise.reject(error);
    }
  );

  return client;
}
