import {spawn} from "node:child_process";
const scripts=["geo","queue","shifts","work-time","work-policy","quotes","payments","orders","whatsapp","events","persistence","api"];
for (const name of scripts) {
  console.log("\n=== simulate:"+name+" ===");
  await new Promise<void>((resolve,reject)=>{
    const child=spawn("npm",["run","simulate:"+name],{stdio:"inherit",shell:process.platform==="win32"});
    child.on("exit",code=>code===0?resolve():reject(new Error("simulation failed: "+name+" ("+code+")")));
  });
}
console.log("\nPipeline de simulação concluído.");
