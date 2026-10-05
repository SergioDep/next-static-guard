export class GuardError extends Error {}
export function publicError(error:unknown):string {
 if(error instanceof GuardError)return error.message;
 const code=(error as NodeJS.ErrnoException|null)?.code;
 if(code==='ENOENT')return 'A required file, directory, or executable is unavailable.';
 if(code==='EACCES'||code==='EPERM'||code==='EROFS')return 'The operation requires access to a file or directory.';
 if(typeof code==='string'&&code.startsWith('ERR_PARSE_ARGS'))return 'Invalid command-line arguments. Run --help for usage.';
 return 'Invalid input or analysis operation failed.';
}
