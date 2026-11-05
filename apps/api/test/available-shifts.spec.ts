import { availableShiftChanges } from '../src/scheduling/available-shifts';
import { prepareShifts } from '../src/scheduling/shift-plan';
const people=[{id:'a',firstName:'Clara',lastName:'Montoro'},{id:'b',firstName:'Elena',lastName:'Pineda'}];
const rule={professionalId:'a',weekday:1,startsAtMinute:540,endsAtMinute:780,validFrom:'2026-10-01',validTo:'2026-12-31'};
const stored={...rule,id:'r1'};
describe('Available shift changes',()=>{
 it('filters a conflicting professional and keeps only an applicable one',()=>{
  const result=availableShiftChanges([{kind:'create',rule},{kind:'create',rule:{...rule,professionalId:'b'}}],[stored],people);
  expect(result.omittedCount).toBe(1);expect(result.changes).toHaveLength(1);expect(result.changes[0].rule?.professionalId).toBe('b');expect(result.alternatives).toEqual([]);
  expect(()=>prepareShifts(result.changes,[stored],people)).not.toThrow();
 });
 it('preserves a valid swap even when an unrelated change is unavailable',()=>{
  const second={...stored,id:'r2',professionalId:'b'};
  const result=availableShiftChanges([{kind:'update',ruleId:'r1',rule:{...rule,professionalId:'b'}},{kind:'update',ruleId:'r2',rule},{kind:'create',rule:{...rule,professionalId:'unknown'}}],[stored,second],people);
  expect(result.changes).toHaveLength(2);expect(result.omittedCount).toBe(1);
 });
 it('does not retain a removal if its replacement fails',()=>{
  const result=availableShiftChanges([{kind:'remove',ruleId:'r1'},{kind:'create',rule:{...rule,startsAtMinute:555}},{kind:'create',rule:{...rule,professionalId:'b'}}],[stored],people);
  expect(result.changes).toHaveLength(1);expect(result.changes[0].rule?.professionalId).toBe('b');expect(result.changes.some(change=>change.kind==='remove')).toBe(false);
 });
 it('offers only same-professional valid alternatives when the requested time is occupied',()=>{
  const other={...stored,id:'r2',startsAtMinute:600,endsAtMinute:840};
  const result=availableShiftChanges([{kind:'update',ruleId:'r1',rule:{...rule,startsAtMinute:600,endsAtMinute:840}}],[stored,other],people);
  expect(result.changes).toEqual([]);expect(result.alternatives.length).toBeGreaterThan(0);
  for(const alternative of result.alternatives){expect(alternative.rule?.professionalId).toBe('a');expect(alternative.ruleId).toBe('r1');expect(()=>prepareShifts([alternative],[stored,other],people)).not.toThrow();}
 });
 it('returns no options for foreign identities or a fully occupied day',()=>{
  const afternoon={...stored,id:'r2',startsAtMinute:960,endsAtMinute:1260};
  const morning={...stored,endsAtMinute:840};
  expect(availableShiftChanges([{kind:'create',rule}],[morning,afternoon],people).alternatives).toEqual([]);
  expect(availableShiftChanges([{kind:'update',ruleId:'foreign',rule}],[],people).alternatives).toEqual([]);
 });
 it('retains complete valid batches without filtering',()=>{
  const result=availableShiftChanges([{kind:'update',ruleId:'r1',rule:{...rule,endsAtMinute:810}}],[stored],people);
  expect(result.omittedCount).toBe(0);expect(result.changes).toHaveLength(1);
 });
});
