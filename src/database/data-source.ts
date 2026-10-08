import 'dotenv/config';
import { DataSource } from 'typeorm';
import { validateEnvironment } from '../config/environment';
import { typeOrmOptions } from './typeorm-options';

export default new DataSource(typeOrmOptions(validateEnvironment(process.env)));
