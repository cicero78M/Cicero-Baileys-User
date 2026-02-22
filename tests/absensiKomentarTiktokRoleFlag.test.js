import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetUsersByClient = jest.fn();
const mockGetUsersByDirektorat = jest.fn();
const mockGetPostsTodayByClient = jest.fn();
const mockGetCommentsByVideoId = jest.fn();
const mockSendDebug = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersByClient: mockGetUsersByClient,
  getUsersByDirektorat: mockGetUsersByDirektorat,
  getClientsByRole: jest.fn(),
}));
jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
  getPostsTodayByClient: mockGetPostsTodayByClient,
  findPostByVideoId: jest.fn(),
  deletePostByVideoId: jest.fn(),
}));
jest.unstable_mockModule('../src/model/tiktokCommentModel.js', () => ({
  getCommentsByVideoId: mockGetCommentsByVideoId,
  deleteCommentsByVideoId: jest.fn(),
}));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
  sendDebug: mockSendDebug,
}));

let absensiKomentar;

beforeAll(async () => {
  ({ absensiKomentar } = await import('../src/handler/fetchabsensi/tiktok/absensiKomentarTiktok.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.ENABLE_MULTI_SOCIAL_MATCHING;
  delete process.env.ENABLE_USER_SOCIAL_ACCOUNTS_FALLBACK;
});

test('uses getUsersByDirektorat when roleFlag is a directorate', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ nama: 'POLRES ABC', client_tiktok: '@abc', client_type: 'org' }] });
  mockGetUsersByDirektorat.mockResolvedValueOnce([]);
  mockGetPostsTodayByClient.mockResolvedValueOnce([]);

  await absensiKomentar('POLRES', { roleFlag: 'ditbinmas' });

  expect(mockGetUsersByDirektorat).toHaveBeenCalledWith('ditbinmas');
  expect(mockGetUsersByClient).not.toHaveBeenCalled();
});

test('regression: primary-only tiktok user keeps previous attendance result', async () => {
  process.env.ENABLE_MULTI_SOCIAL_MATCHING = 'true';
  process.env.ENABLE_USER_SOCIAL_ACCOUNTS_FALLBACK = 'true';

  mockQuery
    .mockResolvedValueOnce({ rows: [{ nama: 'POLRES ABC', client_tiktok: '@abc', client_type: 'org' }] })
    .mockResolvedValueOnce({ rows: [] });
  mockGetUsersByClient.mockResolvedValueOnce([
    {
      user_id: 'U1',
      nama: 'Budi',
      title: 'BRIPKA',
      divisi: 'SAT BINMAS',
      tiktok: '@primarytt',
      status: true,
    },
  ]);
  mockGetPostsTodayByClient.mockResolvedValueOnce([{ video_id: 'VID1' }]);
  mockGetCommentsByVideoId.mockResolvedValueOnce({ comments: [{ username: 'primarytt' }] });

  const msg = await absensiKomentar('POLRESABC', {});

  expect(msg).toContain('• Personel mencapai target : 1/1 (100%)');
  expect(msg).toContain('📎 ❌ *Lampiran – Personel belum mencapai target* (0 user)');
});
