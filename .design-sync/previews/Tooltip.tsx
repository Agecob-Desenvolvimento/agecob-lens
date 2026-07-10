import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'agecob-lens';

export function MetaTrimestre() {
  return (
    <TooltipProvider>
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <Button variant="outline">Meta do trimestre</Button>
        </TooltipTrigger>
        <TooltipContent>Meta do trimestre: R$ 4.20 mi em acordos gerados</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
