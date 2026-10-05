import {authenticated,failure} from '@/lib/server';
import {z} from 'zod';
export async function POST(request:Request){try{
 const {db}=await authenticated(request);const {source_id}=z.object({source_id:z.uuid()}).parse(await request.json());
 const {error}=await db.rpc('request_source_check',{p_source:source_id});if(error)throw error;
 return Response.json({queued:true,message:'Queued for the next worker run. The free daily workflow can also be run manually in GitHub Actions.'});
}catch(e){return failure(e)}}
