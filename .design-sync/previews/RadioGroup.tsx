import { RadioGroup, RadioGroupItem, Label } from 'agecob-lens';

export function Default() {
  const options = [
    { value: 'alfa', label: 'Alfa' },
    { value: 'bradesco', label: 'Bradesco' },
    { value: 'basal', label: 'Basal' },
  ];
  return (
    <RadioGroup defaultValue="bradesco" className="flex flex-col gap-3">
      {options.map((o) => (
        <div key={o.value} className="flex items-center gap-2">
          <RadioGroupItem value={o.value} id={`portfolio-${o.value}`} />
          <Label htmlFor={`portfolio-${o.value}`}>{o.label}</Label>
        </div>
      ))}
    </RadioGroup>
  );
}
