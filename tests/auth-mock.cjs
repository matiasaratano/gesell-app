const user={id:'00000000-0000-0000-0000-000000000001',email:'admin@example.com',aud:'authenticated',role:'authenticated'};
async function mockAuth(route,allowed=true){
 const url=new URL(route.request().url());
 if(url.pathname.startsWith('/auth/v1/')){
  const payload=Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+86400,role:'authenticated'})).toString('base64url');
  await route.fulfill({json:{access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.fake`,refresh_token:'fake',expires_in:86400,token_type:'bearer',user}});return true;
 }
 if(url.pathname==='/rest/v1/rpc/es_administrador'){await route.fulfill({json:allowed});return true;}
 return false;
}
async function login(page,base){
 await page.goto(base+'/');
 await page.getByLabel('Correo',{exact:true}).fill('admin@example.com');
 await page.getByLabel('Contraseña').fill('test-password');
 await page.getByRole('button',{name:'Ingresar',exact:true}).click();
 await page.getByRole('navigation').waitFor();
}
module.exports={mockAuth,login};
