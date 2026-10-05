'use server';
import { profile } from '../lib/profile';
export async function action(){return {name:profile.name};}
