import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Database } from "../apps/api/src/platform.js";
import { ObjectStorage, objectPrefix } from "../packages/config/src/storage.js";
// Operator-only inventory. Never deletes, restores or prints document content.
const db=new Database(), store=new ObjectStorage(), anomalies:{type:string;key:string}[]=[];
const expected=new Set<string>();
try {
  await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    for(const row of await tx.document.findMany({select:{objectKey:true,tenantId:true,projectId:true,deletedAt:true,confirmedAt:true}})){
      if(!row.objectKey.startsWith(`tenant/${row.tenantId}/projects/${row.projectId}/`)) anomalies.push({type:"SCOPE_MISMATCH",key:row.objectKey});
      expected.add(objectPrefix(row.objectKey));
      if(row.confirmedAt&&!row.deletedAt&&!(await store.exists(row.objectKey)))anomalies.push({type:"MISSING_DOCUMENT",key:row.objectKey});
    }
    for(const row of await tx.budgetImportJob.findMany({select:{fileStorageKey:true}}))expected.add(objectPrefix(row.fileStorageKey));
    for(const row of [...await tx.dataExportJob.findMany({select:{objectKey:true}}),...await tx.reportJob.findMany({select:{objectKey:true}})])if(row.objectKey)expected.add(objectPrefix(row.objectKey));
  },{isolationLevel:"RepeatableRead",timeout:300000});
  if(store.s3)for(const prefix of ["projects/","reports/","exports/"]){
    let token:string|undefined;
    do{
      const page=await store.s3.send(new ListObjectsV2Command({Bucket:store.bucket,Prefix:prefix,ContinuationToken:token}));
      for(const item of page.Contents??[])if(item.Key&&!expected.has(item.Key))anomalies.push({type:"UNREFERENCED_REVIEW_ONLY",key:item.Key});
      token=page.NextContinuationToken;
    }while(token);
  }
  console.log(JSON.stringify({driver:store.s3?"s3":"local",expected:expected.size,inventory:store.s3?"completed":"metadata-only",anomalies}));
  if(anomalies.length)process.exitCode=1;
}finally{store.s3?.destroy();await db.$disconnect();}
