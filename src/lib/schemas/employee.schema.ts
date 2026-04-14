import { z } from 'zod'

// {"file":"src/lib/schemas/employee.schema.ts","type":"schema","depends":["zod"],"exports":["employeeSchema","payEventSchema","EmployeeFormValues","PayEventFormValues"],"supabase_tables":["profiles","employee_pay_events"]}

export const employeeSchema = z.object({
  fullName:        z.string().min(2, 'Nom requis'),
  phone:           z.string().optional(),
  role:            z.enum(['vendeur', 'patissier', 'gerant']),
  contractType:    z.enum(['full_time', 'part_time', 'daily']),
  baseSalary:      z.number().min(0, 'Salaire invalide'),
  hireDate:        z.string().optional(),
  pinCode:         z.string()
    .length(4, 'PIN doit être 4 chiffres')
    .regex(/^\d{4}$/, 'PIN doit être 4 chiffres')
    .or(z.literal('')), // vide = pas de changement en mode édition
  identityColor:   z.string(),
  autoLockSeconds: z.number().min(0).max(300),
  avatarUrl:       z.string().url().optional().or(z.literal('')),
})

export const payEventSchema = z.object({
  employeeId: z.string().uuid(),
  month:      z.string().regex(/^\d{4}-\d{2}$/, 'Format YYYY-MM requis'),
  type:       z.enum(['prime', 'retenue']),
  amount:     z.number().positive('Montant doit être positif'),
  label:      z.string().min(1, 'Motif requis'),
})

export type EmployeeFormValues = z.infer<typeof employeeSchema>
export type PayEventFormValues = z.infer<typeof payEventSchema>
