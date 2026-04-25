import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type RecordType = 'received' | 'sent';
export type Scenario = 'celebration' | 'solemn';

export interface LedgerRecord {
  id: string;
  name: string;
  amount: number;
  type: RecordType;
  scenario: Scenario;
  event: string;
  date: string;
  remark?: string;
}

export const SCENARIOS = {
  celebration: {
    name: '喜事登记',
    title: '喜事临门',
    subtitle: '记录每一份诚挚的祝福与情谊',
    gradient: 'celebration-gradient',
    accent: 'secondary',
    events: ['结婚', '订婚', '满月', '升学', '乔迁', '生日', '其他']
  },
  solemn: {
    name: '礼金登记 · 肃穆场合',
    title: '录入随礼账目',
    subtitle: '请如实记录往来金额，保持账目井然有序。',
    gradient: 'solemn-gradient',
    accent: 'on-surface-variant',
    events: ['殡礼', '祭祀', '周年纪念', '其他']
  }
};
