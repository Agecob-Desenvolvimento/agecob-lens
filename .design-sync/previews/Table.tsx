import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from 'agecob-lens';

export function AgentsTable() {
  return (
    <Table>
      <TableCaption>Produtividade por agente — hoje</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Agente</TableHead>
          <TableHead>Portfólio</TableHead>
          <TableHead>CPC</TableHead>
          <TableHead>Conversão</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">Ana Souza</TableCell>
          <TableCell>Alfa</TableCell>
          <TableCell>128</TableCell>
          <TableCell>34,2%</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Carlos Lima</TableCell>
          <TableCell>Bradesco</TableCell>
          <TableCell>96</TableCell>
          <TableCell>28,7%</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Rafaela Dias</TableCell>
          <TableCell>Basal</TableCell>
          <TableCell>141</TableCell>
          <TableCell>41,5%</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

export function PortfolioTableWithFooter() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Portfólio</TableHead>
          <TableHead>Acordos</TableHead>
          <TableHead>Exceções</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">Alfa</TableCell>
          <TableCell>312</TableCell>
          <TableCell>4,1%</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Bradesco</TableCell>
          <TableCell>187</TableCell>
          <TableCell>6,8%</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell>499</TableCell>
          <TableCell>5,2%</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
