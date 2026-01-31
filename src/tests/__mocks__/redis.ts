export const redisClient = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  quit: jest.fn(),
  on: jest.fn(),
  ping: jest.fn().mockResolvedValue('PONG'),
  connect: jest.fn(),
  disconnect: jest.fn(),
};

export const healthCheck = jest.fn().mockResolvedValue(true);
export const getRedisClient = jest.fn().mockReturnValue(redisClient);

export default getRedisClient;
