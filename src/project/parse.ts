import ts from 'typescript';
/** A parser overflow is unsupported input, never a clean source or a raw error. */
export function parseSource(path:string,text:string,kind?:ts.ScriptKind):{ast:ts.SourceFile;failed:boolean} {
  try {
    const ast=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,kind);
    return {ast,failed:((ast as ts.SourceFile & {parseDiagnostics:readonly ts.Diagnostic[]}).parseDiagnostics).length>0};
  } catch(error) {
    if(!(error instanceof RangeError))throw error;
    return {ast:ts.createSourceFile(path,'',ts.ScriptTarget.Latest,true,kind),failed:true};
  }
}
