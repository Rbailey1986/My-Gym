import test from 'node:test';
import assert from 'node:assert/strict';
import { dayReminderPush, restTimerPush, testPush } from '../push-messages.js';

test('localizes every server-generated notification in Italian', () => {
  assert.deepEqual(restTimerPush('it'), {
    title: 'Recupero finito 💪',
    body: 'È ora della prossima serie.',
    tag: 'rest-timer',
  });
  assert.deepEqual(testPush('it'), {
    title: 'openGym',
    body: 'Notifica di prova ✅ Gli avvisi appaiono così.',
    tag: 'test',
  });
  assert.deepEqual(dayReminderPush('it', { name: 'Allenamento A', emoji: '💪' }), {
    title: '💪 Allenamento A oggi',
    body: 'È nel tuo piano. Andiamo 💪',
    tag: 'day-reminder',
  });
});

test('keeps the existing English copy as the fallback', () => {
  assert.deepEqual(restTimerPush('pt-BR'), restTimerPush('en'));
  assert.equal(dayReminderPush('unknown', null).title, 'Workout planned today');
  assert.equal(testPush(undefined).body, 'Test notification ✅ This is what alerts look like.');
});
