import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}

export function DateRangePicker({ startDate, endDate, onChange }: Props) {
  return (
    <div className="flex items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="start_date">Data início</Label>
        <Input
          id="start_date"
          type="datetime-local"
          value={startDate}
          onChange={(e) => onChange(e.target.value, endDate)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="end_date">Data fim</Label>
        <Input
          id="end_date"
          type="datetime-local"
          value={endDate}
          onChange={(e) => onChange(startDate, e.target.value)}
        />
      </div>
    </div>
  );
}

export function toCHDateTime(localValue: string): string {
  if (!localValue) return '';
  return localValue.replace('T', ' ') + ':00';
}

export function defaultRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { startDate: fmt(start), endDate: fmt(end) };
}
