import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.users.findOneBy({ id });
  }

  findByEmailForLogin(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: email.trim().toLowerCase() })
      .getOne();
  }

  async createSales(email: string, passwordHash: string): Promise<void> {
    await this.users
      .createQueryBuilder()
      .insert()
      .into(User)
      .values({
        email: email.trim().toLowerCase(),
        passwordHash,
        role: UserRole.SALES,
      })
      .orIgnore()
      .execute();
  }
}
