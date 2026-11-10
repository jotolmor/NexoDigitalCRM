import { reminderStage } from '../src/automations/reminder-schedule';
const startsAt = new Date('2026-11-13T12:00:00Z');
const at = (minutes: number) => new Date(startsAt.getTime() - minutes * 60000);
const offsets = [4320, 2880, 1440, 60];
describe('appointment reminder schedule', () => {
  it('starts at 72 hours and selects one due stage at each transition', () => {
    expect(reminderStage(startsAt, at(4321), offsets)).toBeNull();
    for (const minutes of offsets) expect(reminderStage(startsAt, at(minutes), offsets)?.minutes).toBe(minutes);
    expect(reminderStage(startsAt, at(3000), offsets)?.minutes).toBe(4320);
    expect(reminderStage(startsAt, at(1000), offsets)?.minutes).toBe(1440);
  });
  it('never catches up missed stages in a burst or sends after the final polling minute', () => {
    expect(reminderStage(startsAt, at(60), offsets)?.minutes).toBe(60);
    expect(reminderStage(startsAt, at(59.5), offsets)?.minutes).toBe(60);
    for (const minutes of [59, 30, 0, -10]) expect(reminderStage(startsAt, at(minutes), offsets)).toBeNull();
  });
  it('supports custom stages without depending on offset ordering', () => {
    expect(reminderStage(startsAt, at(2880), [60,4320,1440,2880,2880])?.minutes).toBe(2880);
    expect(reminderStage(startsAt, at(2880), [4320,1440,60])?.minutes).toBe(4320);
    expect(reminderStage(startsAt, at(3000), [])).toBeNull();
  });
});
