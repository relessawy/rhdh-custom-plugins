const {test}=require('node:test'),assert=require('node:assert/strict');const {validateInput}=require('../index.cjs');
test('accepts bounded demo request',()=>assert.deepEqual(validateInput({purpose:'  API sandbox  ',targetKind:'project',hours:4}),{purpose:'API sandbox',targetKind:'project',hours:4}));
test('rejects arbitrary sizes and lifetimes',()=>{for(const b of [{purpose:'API sandbox',targetKind:'admin',hours:4},{purpose:'API sandbox',targetKind:'project',hours:999},{purpose:'',targetKind:'project',hours:4}])assert.throws(()=>validateInput(b));});
