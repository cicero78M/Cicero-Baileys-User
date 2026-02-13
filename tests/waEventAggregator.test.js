import { jest } from '@jest/globals';
import { handleIncoming } from '../src/service/waEventAggregator.js';

afterEach(() => {
  jest.useRealTimers();
});

test('baileys processes messages without delay', () => {
  jest.useFakeTimers();
  const handler = jest.fn();
  const msg = { from: '123', id: { id: 'abc', _serialized: 'abc' } };

  handleIncoming('baileys', msg, handler);
  jest.runAllTimers();

  expect(handler).toHaveBeenCalledTimes(1);
  expect(handler).toHaveBeenCalledWith(msg);
});

test('duplicate messages are filtered', () => {
  jest.useFakeTimers();
  const handler = jest.fn();
  const msg = { from: '456', id: { id: 'def', _serialized: 'def' } };

  handleIncoming('baileys', msg, handler);
  handleIncoming('baileys', msg, handler);
  jest.runAllTimers();

  expect(handler).toHaveBeenCalledTimes(1);
});

test('messages with different IDs are processed separately when semantic fingerprint differs', () => {
  const handler = jest.fn();
  const msg1 = { from: '789', body: 'first message', id: { id: 'xyz', _serialized: 'xyz' } };
  const msg2 = { from: '789', body: 'second message', id: { id: 'uvw', _serialized: 'uvw' } };

  handleIncoming('baileys', msg1, handler);
  handleIncoming('baileys', msg2, handler);

  expect(handler).toHaveBeenCalledTimes(2);
});

test('semantic dedup filters same body with different IDs inside 5 second window', () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

  const handler = jest.fn();
  const msg1 = { from: '62812345@c.us', body: 'Halo   Admin', id: { id: 'id-1', _serialized: 'id-1' } };
  const msg2 = { from: '62812345@c.us', body: 'halo admin', id: { id: 'id-2', _serialized: 'id-2' } };

  handleIncoming('baileys', msg1, handler);
  jest.advanceTimersByTime(2000);
  handleIncoming('baileys', msg2, handler);

  expect(handler).toHaveBeenCalledTimes(1);
});

test('semantic dedup allows same body with different IDs after 5 second window', () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

  const handler = jest.fn();
  const msg1 = { from: '62812345@c.us', body: 'cek status', id: { id: 'id-11', _serialized: 'id-11' } };
  const msg2 = { from: '62812345@c.us', body: 'cek status', id: { id: 'id-22', _serialized: 'id-22' } };

  handleIncoming('baileys', msg1, handler);
  jest.advanceTimersByTime(6000);
  handleIncoming('baileys', msg2, handler);

  expect(handler).toHaveBeenCalledTimes(2);
});
