import { useForm } from 'react-hook-form';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Button,
} from 'agecob-lens';

export function Basic() {
  const form = useForm({ defaultValues: { matricula: '' } });
  return (
    <Form {...form}>
      <form style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 360 }}>
        <FormField
          control={form.control}
          name="matricula"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Matrícula do agente</FormLabel>
              <FormControl>
                <Input placeholder="Ex: AG-4821" {...field} />
              </FormControl>
              <FormDescription>Usada para localizar o agente no relatório.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Salvar</Button>
      </form>
    </Form>
  );
}

export function MultiField() {
  const form = useForm({ defaultValues: { portfolio: 'Bradesco', observacao: '' } });
  return (
    <Form {...form}>
      <form style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 360 }}>
        <FormField
          control={form.control}
          name="portfolio"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Portfólio</FormLabel>
              <FormControl>
                <Input placeholder="Ex: Alfa" {...field} />
              </FormControl>
              <FormDescription>Portfólio afetado pela exceção.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="observacao"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Observação</FormLabel>
              <FormControl>
                <Input placeholder="Motivo da exceção" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex gap-2">
          <Button type="submit">Salvar</Button>
          <Button type="button" variant="outline">
            Cancelar
          </Button>
        </div>
      </form>
    </Form>
  );
}
