import DS from 'ember-data';

export default DS.JSONAPISerializer.extend({
  /*
   * @summary normalizing the payload from api response with array type ([{},{}..]) to correct json-api format spec. See  http://jsonapi.org/
   */
  normalizeArrayResponse(store, primaryModelClass, payload, id, requestType) {
    //we are kind of doing the job of the this._super(...) here to convert a 'classic JSON' payload into JSON API.
    let data = payload.map((resourcePayload) => {
      let attributes = {};
      primaryModelClass.eachAttribute(key => {
        attributes[key] = resourcePayload[key];
      });

      return {
        id: resourcePayload.id,
        type: primaryModelClass.modelName,
        attributes
      };
    });

    return {
      data
    };
  }
  /*
   * serializing the data to send to the api server
   */
   //TODO: Will keep this as we will need it when we implement the save/post api methods. - lohuynh
  // serialize(snapshot, options) {
  //   let json = this._super(...arguments);
  //
  //   json.data.attributes.cost = {
  //     amount: json.data.attributes.amount,
  //     currency: json.data.attributes.currency
  //   };
  //
  //   delete json.data.attributes.amount;
  //   delete json.data.attributes.currency;
  //
  //   return json;
  // }
});
