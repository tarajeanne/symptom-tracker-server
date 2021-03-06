const app = require('../src/app');
const helpers = require('./test-helpers');
describe('Food Endpoint', function() {
  let db;

  const testUsers = helpers.makeUsersArray();
  const testUser = testUsers[0];

  before('make knex instance', () => {
    db = helpers.makeKnexInstance();
    app.set('db', db);
  });

  after('disconnect from db', () => db.destroy());

  before('cleanup', () => helpers.cleanTables(db));

  afterEach('cleanup', () => helpers.cleanTables(db));
  describe('GET /food/search?search=id',()=>{
    beforeEach('insert users', () => helpers.seedUsers(db, testUsers));

    it('responds with 400 if search query parameter is empty',()=>{
      return supertest(app)
        .get('/api/food/search')
        .set('Authorization', helpers.makeAuthHeader(testUsers[0])).expect(400);
    });

    it('responds with 200 and responds with a correct looking JSON string rep of an object if queried without brand',()=>{
      const searchTerm='ramen';
      return supertest(app)
        .get(`/api/food/search?search=${searchTerm}`)
        .set('Authorization', helpers.makeAuthHeader(testUsers[0])).expect(200)
        .then(res=>{
          let trueRes=JSON.parse(res.body);
          expect(trueRes).to.be.an('object');
          expect(trueRes).to.include.all.keys('foodSearchCriteria','totalHits','currentPage','totalPages','foods');
          expect(trueRes.foodSearchCriteria).to.include.all.keys('generalSearchInput');
          expect(trueRes.foodSearchCriteria.generalSearchInput).to.equal(searchTerm);
          expect(trueRes.totalPages).to.be.at.least(2);
          expect(trueRes.foods).to.be.an('array');
          for(let i=0;i<trueRes.foods.length;i++){
            expect(trueRes.foods[i]).to.include.all.keys('description','fdcId','dataType');
            if(trueRes.foods[i].dataType==='Branded'){
              expect(trueRes.foods[i]).to.include.all.keys('brandOwner');
            }
          }
        });
    });
    it('responds with 200 and responds with a correct looking JSON string rep of an object if query includes brand',()=>{
      const searchTerm='chips';
      const brand='lay\'s';
      return supertest(app)
        .get(`/api/food/search?search=${searchTerm}&brand=${brand}`)
        .set('Authorization', helpers.makeAuthHeader(testUsers[0])).expect(200)
        .then(res=>{
          let trueRes=JSON.parse(res.body);
          expect(trueRes).to.be.an('object');
          expect(trueRes).to.include.all.keys('foodSearchCriteria','totalHits','currentPage','totalPages','foods');
          expect(trueRes.foodSearchCriteria).to.include.all.keys('generalSearchInput');
          expect(trueRes.foodSearchCriteria.generalSearchInput).to.equal(searchTerm);
          expect(trueRes.totalPages).to.be.at.least(2);
          expect(trueRes.foods).to.be.an('array');
          for(let i=0;i<trueRes.foods.length;i++){
            expect(trueRes.foods[i]).to.include.all.keys('description','fdcId','dataType');
            if(trueRes.foods[i].dataType==='Branded'){
              expect(trueRes.foods[i]).to.include.all.keys('brandOwner');
            }
          }
        });
    });
  });

  describe('POST /food/',()=>{
    beforeEach('insert users', () => helpers.seedUsers(db, testUsers));
    it('returns 400 if ndbno is not present in request body',()=>{
      const newFood={};
      return supertest(app)
        .post('/api/food')
        .set('Authorization', helpers.makeAuthHeader(testUsers[0]))
        .send(newFood)
        .expect(400);
    });
    it('returns 400 if the ndbno posted does not exist',()=>{
      const newFood={
        ndbno:7
      };
      return supertest(app)
        .post('/api/food')
        .set('Authorization', helpers.makeAuthHeader(testUsers[0]))
        .send(newFood)
        .expect(400);
    });
    it('returns 204 if the ndbno posted exists, and we check if our database has put in the food and the ingredients',()=>{
      const ndbno=363898;
      return helpers.postFoodToServer(ndbno,helpers.makeAuthHeader(testUsers[0]))
        .expect(204)
        .then(()=>{
          return db.from('food')
            .select('*')
            .where({ndbno})
            .first();
        })
        .then(res=>{
          expect(Number(res.ndbno)).to.equal(ndbno);
          return db.from('ingredients')
            .select('*')
            .where({'food':ndbno});
        })
        .then(res=>{
          const answer=['ORGANIC BROWN RICE FLOUR','ORGANIC WHITE RICE FLOUR','BAMBOO EXTRACT'];
          for(let i=0;i<res.length;i++){
            expect(Number(res[i].food)).to.equal(ndbno);
            expect(answer).to.include(res[i].name);
          }
        });
    });
  });

});