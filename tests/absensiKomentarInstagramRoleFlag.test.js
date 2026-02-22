import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetUsersByClient = jest.fn();
const mockGetUsersByDirektorat = jest.fn();
const mockGetShortcodesTodayByClient = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersByClient: mockGetUsersByClient,
  getUsersByDirektorat: mockGetUsersByDirektorat,
}));
jest.unstable_mockModule('../src/model/instaPostModel.js', () => ({
  getShortcodesTodayByClient: mockGetShortcodesTodayByClient,
}));

let absensiKomentarInstagram;

beforeAll(async () => {
  ({ absensiKomentarInstagram } = await import('../src/handler/fetchabsensi/insta/absensiKomentarInstagram.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.ENABLE_MULTI_SOCIAL_MATCHING;
  delete process.env.ENABLE_USER_SOCIAL_ACCOUNTS_FALLBACK;
});

test('uses getUsersByDirektorat when roleFlag is a directorate', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ nama: 'POLRES ABC' }] });
  mockGetUsersByDirektorat.mockResolvedValueOnce([]);
  mockGetShortcodesTodayByClient.mockResolvedValueOnce([]);

  await absensiKomentarInstagram('POLRES', { roleFlag: 'ditbinmas' });

  expect(mockGetUsersByDirektorat).toHaveBeenCalledWith('ditbinmas');
  expect(mockGetUsersByClient).not.toHaveBeenCalled();
});

test('regression: primary-only instagram user keeps previous attendance result', async () => {
  process.env.ENABLE_MULTI_SOCIAL_MATCHING = 'true';
  process.env.ENABLE_USER_SOCIAL_ACCOUNTS_FALLBACK = 'true';

  mockQuery
    .mockResolvedValueOnce({ rows: [{ nama: 'POLRES ABC' }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ username: 'primaryig' }] });
  mockGetUsersByClient.mockResolvedValueOnce([
    {
      user_id: 'U1',
      nama: 'Budi',
      title: 'BRIPKA',
      divisi: 'SAT BINMAS',
      insta: '@primaryig',
      status: true,
    },
  ]);
  mockGetShortcodesTodayByClient.mockResolvedValueOnce(['SC1']);

  const msg = await absensiKomentarInstagram('POLRESABC', {});

  expect(msg).toContain('✅ *Sudah melaksanakan* : *1 user*');
  expect(msg).toContain('❌ *Belum melaksanakan* : *0 user*');
});
