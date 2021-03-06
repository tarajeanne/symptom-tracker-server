const express = require('express');
const EventService = require('./event-service');
const EventRouter = express.Router();
const jsonBodyParser = express.json();
const { requireAuth } = require('../middleware/jwt-auth');
const { serializeObjectArr, serializeObject } = require('../helpers/serialize.js')
const xss = require('xss');

EventRouter.use(requireAuth)
  .post('/', jsonBodyParser, async (req, res, next) => {
    try {
      const { type, time } = req.body;
      if (!type) {
        return res.status(400).send({
          error: "Missing 'type' in request body"
        });
      }
      if (type === 'symptom') {
        const { symptom, severity } = req.body;
        for (const field of ['symptom', 'severity'])
          if (req.body[field] == null)
            return res.status(400).json({
              error: `Missing '${field}' in request body`
            });
        if (symptom === '') {
          return res.status(400).json({ error: 'Symptom name is required' });
        }
        if (symptom.length > 20) {
          return res.status(400).json({ error: 'Symptom name is too long' });
        }
        let type_id = await EventService.getSymptomTypeId(
          req.app.get('db'),
          req.user.id,
          symptom.toLowerCase()
        );

        if (!type_id) {
          type_id = await EventService.postSymptomType(
            req.app.get('db'),
            req.user.id,
            symptom.toLowerCase()
          );
        }

        const event = {
          created: time,
          severity_id: severity,
          type_id
        };

        const response = await EventService.postSymptomEvent(
          req.app.get('db'),
          event
        );
        const severityObj = await EventService.getSeverity(
          req.app.get('db'),
          response.severity_id
        );
        const adjustedResponse = {
          type: 'symptom',
          symptom: symptom,
          severityNumber: response.severity_id,
          severity: severityObj.name,
          name: symptom,
          time: response.created,
          id: response.id
        }
        const serializedAdjustedResponse = serializeObject(adjustedResponse)
        return res
          .status(201)
          .json(serializedAdjustedResponse);
      }
      if (type === 'meal') {
        const { items, name } = req.body;
        for (const field of ['items', 'name'])
          if (req.body[field] == null)
            return res.status(400).json({
              error: `Missing '${field}' in request body`
            });
        if(typeof name !== 'string'){
          return res.status(400).json({
            error: `Name must be string in request body`
          });
        }
        if(name.length>40){
          return res.status(400).json({
            error: `Name is too long`
          });
        }
        const event = {
          user_id: req.user.id,
          name,
          created: time
        };
        //insert meal first
        const response = await EventService.postMeal(req.app.get('db'), event);
        //insert plates by ndbno and meal id which references user_id

        await EventService.postPlates(req.app.get('db'), items, response.id);
        let meal = {
          type: 'meal',
          id: response.id,
          name: response.name,
          time: response.created,
          items: []
        };
        let foods = await EventService.getFoodsInMeal(
          req.app.get('db'),
          response.id
        );
        for (let j = 0; j < foods.length; j++) {
          let food = {
            name: foods[j].name
          };
          let ingredients = await EventService.getIngredients(
            req.app.get('db'),
            foods[j].ndbno
          );
          food.ingredients = ingredients.map((ingredient) => ingredient.name);
          meal.items.push(food);
          food.ndbno = foods[j].ndbno;
        }
        const serializedMeal = serializeObject(meal);
        return res
          .status(201)
          .json(serializedMeal);
      }
      next();
    } catch (error) {
      next(error);
    }
  })
  .get('/', async (req, res, next) => {
    try {
      let user_id = req.user.id;
      let meals = await EventService.getMealsFromUser(req.app.get('db'), user_id);
      let events = [];
      for (let i = 0; i < meals.length; i++) {
        let meal = {
          type: 'meal',
          id: meals[i].id,
          name: meals[i].name,
          time: meals[i].created,
          items: []
        };
        let foods = await EventService.getFoodsInMeal(
          req.app.get('db'),
          meals[i].id
        );
        for (let j = 0; j < foods.length; j++) {
          let food = {
            name: foods[j].name
          };
          let ingredients = await EventService.getIngredients(
            req.app.get('db'),
            foods[j].ndbno
          );
          food.ingredients = ingredients.map((ingredient) => ingredient.name);
          meal.items.push(food);
          food.ndbno = foods[j].ndbno;
        }
        events.push(meal);
      }
      let symptomTypes = await EventService.getSymptomTypesByUser(
        req.app.get('db'),
        user_id
      );
      symptomTypes = symptomTypes.map((sym) => sym.id);
      let symptoms = await EventService.getAllSymptomEvents(
        req.app.get('db'),
        symptomTypes
      );
      for (let i = 0; i < symptoms.length; i++) {
        //might have problems here, not really able to test
        events.push({
          type: 'symptom',
          symptom: symptoms[i].type,
          severityNumber: symptoms[i].severity_id,
          severity: symptoms[i].name,
          name: symptoms[i].type,
          time: symptoms[i].created,
          id: symptoms[i].id
        });
      }
      events.sort(
        (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
      );
      let result = {
        username: xss(req.user.username),
        display_name: xss(req.user.display_name),
        events: serializeObjectArr(events)
      }
      return res
        .status(200)
        .json(result)
    }
    catch (err) {
      next(err);
    }


  })
  .delete('/', jsonBodyParser, async (req, res, next) => {
    try {
      const { type, id } = req.body;
      for (const field of ['type', 'id'])
        if (req.body[field] == null)
          return res.status(400).json({
            error: `Missing '${field}' in request body`
          });

      if (type === 'meal') {
        const meal = await EventService.getMealById(req.app.get('db'), id);
        if (!meal) {
          return res.status(404).send({ error: 'Meal not found' });
        }
        if (meal.user_id !== req.user.id) {
          return res.status(403).send({ error: 'Meal does not belong to user' });
        }
        await EventService.deleteMeal(req.app.get('db'), id);
        return res.status(204).send();
      } else if (type === 'symptom') {
        const symptom = await EventService.getSymptomEventById(
          req.app.get('db'),
          id
        );
        if (!symptom) {
          return res.status(404).send({ error: 'Symptom not found' });
        }
        const user = await EventService.getUserBySymptom(req.app.get('db'), id);
        if (user !== req.user.id) {
          return res
            .status(403)
            .send({ error: 'Symptom does not belong to user' });
        }
        await EventService.deleteSymptom(req.app.get('db'), id);
        return res.status(204).send();
      }
    }
    catch (err) {
      next(err);
    }
  });

module.exports = EventRouter;
