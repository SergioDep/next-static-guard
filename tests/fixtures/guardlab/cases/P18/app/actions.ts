'use server';
import { profile } from '../lib/profile';
export async function action(){return {token:profile.token};}
