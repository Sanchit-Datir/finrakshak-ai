/** People, companies, accounts and counterparties in the entity graph. */

import type { Entity } from '../../domain/schemas.js';

export const ent = (
  id: string,
  kind: Entity['kind'],
  name: string,
  subtitle: string,
  ownerId: string | null = null,
  borrowerId: string | null = null,
): Entity => ({
  id,
  kind,
  name,
  subtitle,
  ownerId,
  borrowerId,
});

/** A bank account entity; the number is masked. */
export const account = (id: string, owner: string, masked: string): Entity =>
  ent(id, 'account', `A/c ${masked}`, 'Bank account (masked)', owner);

export function demoEntities(): Entity[] {
  const entities: Entity[] = [
    ent('e-ramesh', 'individual', 'Ramesh Shankar Jadhav', 'Farmer, Karde', null, 'b-ramesh'),
    ent('e-sunita', 'individual', 'Sunita Vilas Pawar', 'Farmer, Otur', null, 'b-sunita'),
    ent('e-ganesh-kale', 'individual', 'Ganesh Kale', 'Proprietor', null, null),
    ent(
      'c-ganesh-agro',
      'company',
      'Ganesh Agro Traders',
      'Proprietorship, Shirur',
      null,
      'b-ganesh-agro',
    ),
    ent(
      'e-dnyaneshwar',
      'individual',
      'Dnyaneshwar Kisan Thorat',
      'Farmer, Nhavare',
      null,
      'b-dnyaneshwar',
    ),
    ent('e-mahesh', 'individual', 'Mahesh Dattatray Shinde', 'Farmer, Malegaon', null, 'b-mahesh'),
    ent('e-sachin', 'individual', 'Sachin Bhosale', 'Proprietor', null, null),
    ent(
      'c-omsai',
      'company',
      'Om Sai Krishi Seva Kendra',
      'Agri-input retailer, Junnar',
      null,
      'b-omsai',
    ),
    ent(
      'c-bhosale-infra',
      'company',
      'Bhosale Infra Developers Pvt Ltd',
      'Construction company',
      null,
      null,
    ),
    ent('c-navnath', 'company', 'Navnath Enterprises', 'Trading firm (counterparty)', null, null),
    ent('e-navnath-gade', 'individual', 'Navnath Gade', 'Guarantor named in A-1013', null, null),
    ent('e-rohit', 'individual', 'Rohit Sachin Bhosale', 'Shree Traders, Junnar', null, 'b-rohit'),
    ent('c-shivneri', 'company', 'Shivneri Agro Equipments Pvt Ltd', 'Tractor dealer', null, null),
    ent('e-vikas-more', 'individual', 'Vikas More', 'Director', null, null),
    ent('e-kiran', 'individual', 'Kiran Rajaram Gaikwad', 'Gaikwad Poultry Farm', null, 'b-kiran'),
    ent('c-godavari', 'company', 'Godavari Poultry Feeds', 'Feed supplier', null, null),
    ent('e-anil', 'individual', 'Anil Bapu Kshirsagar', 'Farmer, Indapur', null, 'b-anil'),
    ent(
      'c-sinchan',
      'company',
      'Sinchan Irrigation Supplies',
      'Drip irrigation dealer',
      null,
      null,
    ),
    ent('c-krushi', 'company', 'Shree Krushi Kendra', 'Fertiliser shop', null, null),
    ent('c-nirmal', 'company', 'Nirmal Seeds Depot', 'Seed retailer', null, null),
    ent('e-meera', 'individual', 'Meera Santosh Kulkarni', 'Individual', null, 'b-meera'),
    ent(
      'e-yogesh',
      'individual',
      'Yogesh Prakash Deshpande',
      'Deshpande & Sons (partnership)',
      null,
      'b-yogesh',
    ),
    ent(
      'c-sahyadri-food',
      'company',
      'Sahyadri Food Processors Pvt Ltd',
      'Food processing',
      null,
      'b-sahyadri-food',
    ),
    ent('e-savita', 'individual', 'Savita Dnyandev Mane', 'Farmer, Pabal', null, 'b-savita'),
    ent(
      'p-civil-117',
      'proceeding',
      'Civil suit 117 (demo record)',
      'Commercial dispute — demo entry, not a public-record lookup',
    ),
    ent('x-cash', 'counterparty', 'Cash withdrawal', 'Counter / ATM'),
  ];
  entities.push(
    account('a-ramesh', 'e-ramesh', 'XXXX 7710'),
    account('a-mahesh', 'e-mahesh', 'XXXX 2231'),
    account('a-shivneri', 'c-shivneri', 'XXXX 9054'),
    account('a-omsai', 'c-omsai', 'XXXX 3318'),
    account('a-sachin', 'e-sachin', 'XXXX 6402'),
    account('a-bhosale-infra', 'c-bhosale-infra', 'XXXX 1187'),
    account('a-navnath', 'c-navnath', 'XXXX 5520'),
    account('a-kiran', 'e-kiran', 'XXXX 8843'),
    account('a-godavari', 'c-godavari', 'XXXX 2765'),
    account('a-anil', 'e-anil', 'XXXX 4109'),
    account('a-sinchan', 'c-sinchan', 'XXXX 7781'),
    account('a-krushi', 'c-krushi', 'XXXX 0936'),
    account('a-nirmal', 'c-nirmal', 'XXXX 3650'),
    account('a-dnyaneshwar', 'e-dnyaneshwar', 'XXXX 1290'),
  );
  return entities;
}
