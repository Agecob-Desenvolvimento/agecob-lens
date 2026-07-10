import { Avatar, AvatarImage, AvatarFallback } from 'agecob-lens';

export function Fallback() {
  return (
    <div className="flex items-center gap-3">
      <Avatar>
        <AvatarFallback>AS</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>CL</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>RD</AvatarFallback>
      </Avatar>
    </div>
  );
}

export function WithImage() {
  return (
    <Avatar>
      <AvatarImage src="https://i.pravatar.cc/80?img=12" alt="Ana Souza" />
      <AvatarFallback>AS</AvatarFallback>
    </Avatar>
  );
}

export function AgentRow() {
  return (
    <div className="flex items-center gap-2">
      <Avatar>
        <AvatarFallback>RD</AvatarFallback>
      </Avatar>
      <div className="flex flex-col">
        <span className="text-sm font-medium">Rafaela Dias</span>
        <span className="text-xs text-slate-500">Portfólio Basal</span>
      </div>
    </div>
  );
}
