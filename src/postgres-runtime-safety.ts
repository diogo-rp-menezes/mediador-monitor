import type {Pool} from 'pg';

/** Runtime roles must be standalone: NOINHERIT alone does not prevent SET ROLE. */
export async function validarPapelRuntimePostgres(pool:Pick<Pool,'query'>){
  const {rows}=await pool.query<{nome:string;super:boolean;bypass:boolean;herda:boolean;membro:boolean}>(`
    SELECT current_user AS nome, r.rolsuper AS super, r.rolbypassrls AS bypass,
      r.rolinherit AS herda,
      EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid) AS membro
    FROM pg_roles r WHERE r.rolname=current_user`);
  const role=rows[0];
  if(!role||role.super||role.bypass||role.herda||role.membro)
    throw new Error('Runtime exige NOSUPERUSER, NOBYPASSRLS, NOINHERIT e ausência de associação a outros papéis.');
  return {nome:role.nome,validado:true as const};
}

