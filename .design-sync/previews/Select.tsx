import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from 'agecob-lens';

export function Closed() {
  return (
    <Select>
      <SelectTrigger className="w-full max-w-sm">
        <SelectValue placeholder="Selecione o portfólio" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="alfa">Alfa</SelectItem>
        <SelectItem value="bradesco">Bradesco</SelectItem>
        <SelectItem value="basal">Basal</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function Open() {
  return (
    <Select defaultOpen defaultValue="bradesco">
      <SelectTrigger className="w-full max-w-sm">
        <SelectValue placeholder="Selecione o portfólio" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Portfólios</SelectLabel>
          <SelectItem value="alfa">Alfa</SelectItem>
          <SelectItem value="bradesco">Bradesco</SelectItem>
          <SelectItem value="basal">Basal</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
