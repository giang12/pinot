/**
 * Handles alert form creation settings
 * @module self-serve/create/controller
 * @exports create
 */
import Ember from 'ember';
import { task, timeout } from 'ember-concurrency';
import moment from 'moment';
import fetch from 'fetch';

export default Ember.Controller.extend({
  /**
   * Array of metrics we're displaying
   */
  isMetricSelected: false,
  isValidated: false,
  showAlertGroupEdit: true,
  filters: {},
  graphConfig: {},

  init() {
    this._super(...arguments);
    this.set('isSubmitDisabled', true);
  },

  /**
   * Handler for search by function name
   * Utilizing ember concurrency (task)
   */
  searchMetricsList: task(function* (metric) {
    yield timeout(600);
    const url = `/data/autocomplete/metric?name=${metric}`;
    return fetch(url)
      .then(res => res.json())
  }),

  /**
   * Handler for search by function name
   * Utilizing ember concurrency (task)
   */
  fetchMetricDimensions(metricId) {
    const url = `/data/autocomplete/dimensions/metric/${metricId}`;
    return fetch(url)
      .then(res => res.json())
  },

  fetchFunctionById(functionId) {
    const url = `/onboard/function/${functionId}`;
    return fetch(url)
      .then(res => res.json())
  },

  fetchAnomalyByName(name) {
    const url = `/data/autocomplete/functionByName?name=${name}`;
    return fetch(url)
      .then(res => res.json())
  },

  fetchMetricData(metricId) {
    const promiseHash = {
      granularities: fetch(`/data/agg/granularity/metric/${metricId}`).then(res => res.json()),
      filters: fetch(`/data/autocomplete/filters/metric/${metricId}`).then(res => res.json()),
      maxTime: fetch(`/data/maxDataTime/metricId/${metricId}`).then(res => res.json()),
      selectedMetricDimensions: fetch(`/data/autocomplete/dimensions/metric/${metricId}`).then(res =>res.json()),
    };

    return Ember.RSVP.hash(promiseHash);
  },

  fetchAnomalyGraphData(config) {
    this.set('loading', true);
    const {
      id,
      dimension,
      currentStart,
      currentEnd,
      baselineStart,
      baselineEnd,
      granularity,
      filters
    } = config;

    const url = `/timeseries/compare/${id}/${currentStart}/${currentEnd}/${baselineStart}/${baselineEnd}?dimension=${dimension}&granularity=${granularity}&filters=${filters}`;
    return fetch(url)
      .then(res => res.json())
  },

  triggerGraphFromMetric(metric) {
    const maxTime = this.get('maxTime');
    const currentEnd = moment(maxTime).isValid()
      ? moment(maxTime).valueOf()
      : moment().subtract(1,'day').endOf('day').valueOf();
    const granularity = this.get('granularities.firstObject');

    const currentStart = moment(currentEnd).subtract(1, 'months').valueOf();
    const baselineStart = moment(currentStart).subtract(1, 'week').valueOf();
    const baselineEnd = moment(currentEnd).subtract(1, 'week');
    const { id } = metric;

    const graphConfig = {
      id,
      dimension: 'All',
      currentStart,
      currentEnd,
      baselineStart,
      baselineEnd,
      granularity,
    };
    this.set('graphConfig', graphConfig);
    console.log(JSON.stringify(graphConfig));

    this.fetchAnomalyGraphData(this.get('graphConfig')).then(metricData => {
      this.set('isMetricSelected', true);
      this.set('selectedMetric', metricData);
      this.set('loading', false);
    });
  },

  triggerGraphFromDimensions(dimension) {
    this.graphConfig.dimension = dimension;
    this.fetchAnomalyGraphData(this.graphConfig).then(metricData => {
      this.set('isMetricSelected', true);
      this.set('selectedMetric', metricData);
      this.set('loading', false);
    });
  },

  triggerReplay(functionObj, groupObj, newFuncId) {
    const startTime = moment().subtract(1,'day').endOf('day').format("YYYY-MM-DD");
    const startStamp = moment().subtract(1,'day').endOf('day').valueOf();
    const endTime = moment().subtract(1,'month').endOf('day').format("YYYY-MM-DD");
    const endStamp = moment().subtract(1,'month').endOf('day').valueOf();
    const granularity = this.get('graphConfig.granularity').toLowerCase();
    const postProps = {
      method: 'post',
      headers: { 'content-type': 'Application/Json' }
    };
    let gkey = '';

    const replayApi = {
      base: 'http://lva1-app0038.corp.linkedin.com:1867/api/detection-job',
      minute: `/replay/singlefunction?functionId=${newFuncId}&start=${startTime}&end=${endTime}`,
      hour: `/${newFuncId}/replay?start=${startTime}&end=${endTime}`,
      day: `/replay/function/${newFuncId}?start=${startTime}&end=${endTime}&goal=1.0&evalMethod=F1_SCORE&includeOriginal=false&tune=\{"pValueThreshold":\[0.001,0.005,0.01,0.05\]\}`,
      reports: `/thirdeye/email/generate/metrics/${startStamp}/${endStamp}?metrics=${functionObj.metric}&subject=Your%20Metric%20Has%20Onboarded%20To%20Thirdeye&from=thirdeye-noreply@linkedin.com&to=${groupObj.recipients}&teHost=http://lva1-app0583.corp.linkedin.com:1426&smtpHost=email.corp.linkedin.com&smtpPort=25&includeSentAnomaliesOnly=true&isApplyFilter=true`
    };

    if (granularity.includes('minute')) { gkey = 'minute'; }
    if (granularity.includes('hour')) { gkey = 'hour'; }
    if (granularity.includes('day')) { gkey = 'day'; }

    return new Ember.RSVP.Promise((resolve) => {
      fetch(replayApi.base + replayApi[gkey], postProps).then(res => resolve(res.json()));
    });
  },


  prepareFunctions(configGroup, newId = 0) {
    const newFunctionList = [];
    const existingFunctionList = configGroup.emailConfig ? configGroup.emailConfig.functionIds : [];
    let cnt = 0;
    return new Ember.RSVP.Promise((resolve) => {
      for (var functionId of existingFunctionList) {
        this.fetchFunctionById(functionId).then(functionData => {
          newFunctionList.push({
            id: functionData.id,
            name: functionData.functionName,
            metric: functionData.metric,
            type: functionData.type,
            active: functionData.isActive,
            isNewId: functionData.id === newId
          });
          cnt ++;
          if (existingFunctionList.length === cnt) {
            resolve(newFunctionList);
          }
        });
      }
    });
  },

  saveThirdEyeEntity(alertData, entityType) {
    const postProps = {
      method: 'post',
      body: JSON.stringify(alertData),
      headers: { 'content-type': 'Application/Json' }
    };
    const url = '/thirdeye/entity?entityType=' + entityType;
    return fetch(url, postProps);
  },

  saveThirdEyeFunction(functionData) {
    const postProps = {
      method: 'post',
      headers: { 'content-type': 'Application/Json' }
    };
    const url = '/dashboard/anomaly-function/create?' + $.param(functionData);
    return fetch(url, postProps)
      .then(res => res.json());
  },

  /**
   * Placeholder for patterns of interest options
   */
  patternsOfInterest: ['None', 'Up', 'Down', 'Either'],
  /**
   * Placeholder for alert groups options
   */
  allAlertsConfigGroups: Ember.computed.reads('model.allAlertsConfigGroups'),
  /**
   * Placeholder for app name options
   */
  allApplicationNames: Ember.computed.reads('model.allAppNames'),
  /**
   * Actions for create alert form view
   */
  actions: {
    /**
     * Function called when the dropdown value is updated
     * @method onChangeDropdown
     * @param {Object} selectedObj - If has dataset, this is the selected value from dropdown
     * @return {undefined}
     */
    onSelectMetric(selectedObj) {
      console.log(selectedObj);
      this.set('selectedMetricOption', selectedObj);
      this.fetchMetricData(selectedObj.id).then((hash) => {
        this.setProperties(hash);
        this.triggerGraphFromMetric(selectedObj);
      })
      // this.loadDimensionOptions(selectedObj);
    },

    onSelectFilter(filters) {
      this.set('graphConfig.filters', filters);
      this.fetchAnomalyGraphData(this.get('graphConfig')).then(metricData => {
        this.set('isMetricSelected', true);
        this.set('selectedMetric', metricData);
        this.set('loading', false);
      });
    },

    onSelectDimension(selectedObj) {
      this.set('dimensionSelectorVal', selectedObj);
      this.triggerGraphFromDimensions(selectedObj);
    },

    onSelectPattern(selectedObj) {
      this.set('selectedPattern', selectedObj);
    },

    onSelectAppName(selectedObj) {
      this.set('selectedAppName', selectedObj);
    },

    onSelectConfigGroup(selectedObj) {
      if (selectedObj) {
        this.set('selectedConfigGroup', selectedObj);
        this.set('selectedGroupRecipients', selectedObj.recipients.replace(/,+/g, ', '));
        this.set('selectedGroupActive', selectedObj.active);
        this.set('showAlertGroupEdit', true);
        this.prepareFunctions(selectedObj).then(functionData => {
          this.set('selectedGroupFunctions', functionData);
        });
      } else {
        this.set('configSelectorVal', '');
      }
    },

    onClickChangeGroupEditMode() {
      this.toggleProperty('showAlertGroupEdit');
    },

    // Make sure alert name does not exist in system
    validateAlertName(name) {
      let isDuplicateName = false;
      this.fetchAnomalyByName(name).then(anomaly => {
        for (var resultObj of anomaly) {
          if (resultObj.functionName === name) {
            isDuplicateName = true;
          }
        }
        this.set('isAlertNameDuplicate', isDuplicateName);
      });
    },

    // Verify that email address does not already exist in alert group. If it does, remove it and alert user.
    validateAlertEmail(emailInput) {
      const existingEmailArr = this.get('selectedGroupRecipients');
      const newEmailArr = emailInput.replace(/\s+/g, '').split(',');
      let cleanEmailArr = [];
      let badEmailArr = [];
      let isDuplicateErr = false;

      existingEmailArr.replace(/\s+/g, '').split(',');
      for (var email of newEmailArr) {
        console.log('existingEmailArr.includes(email) ', existingEmailArr.includes(email), email);
        if (existingEmailArr.includes(email)) {
          isDuplicateErr = true;
          badEmailArr.push(email);
        } else {
          cleanEmailArr.push(email);
        }
      }

      this.send('validateRequired');
      this.set('isDuplicateEmail', isDuplicateErr);
      this.set('duplicateEmails', badEmailArr.join());
      this.set('alertGroupNewRecipient', cleanEmailArr.join(', '));
    },

    // Ensures presence of values for these fields. TODO: make this more efficient
    validateRequired() {
      const reqFields = ['selectedMetricOption', 'selectedPattern', 'alertFunctionName', 'alertGroupNewRecipient'];
      let allFieldsReady = true;

      for (var field of reqFields) {
        if (Ember.isNone(this.get(field))) {
          allFieldsReady = false;
        }
      }

      this.set('isSubmitDisabled', !allFieldsReady);
    },

    /**
     * User hit submit. Buckle up - we're going for a ride! What we have to do here is:
     * 1. Make sure all fields are validated
     * 2. Send a new 'alert function' create request, which should return a new function ID
     * 3. Add this Id to the 'Alert Config Group' for notifications
     * 4. Send a Edit or Create request for the Alert Config Group based on user's choice
     * 5. Notify user of result
     */
    submit() {
      // This object contains the data for the new config group
      const newConfigObj = {
        name: this.get('createGroupName'),
        active: this.get('createGroupActive') || false,
        emailConfig: { "functionIds": [] },
        recipients: this.get('alertGroupNewRecipient')
      };
      // This object contains the data for the new alert function, with default fillers
      const newFunctionObj = {
        functionName: this.get('alertFunctionName'),
        metric: this.get('selectedMetricOption').name,
        dataset: this.get('selectedMetricOption').dataset,
        metricFunction: 'SUM',
        type: 'SIGN_TEST_VANILLA',
        windowSize: 6,
        windowUnit: this.get('graphConfig.granularity'),
        isActive: false,
        properties: 'signTestWindowSize=24;anomalyRemovalWeightThreshold=0.6;signTestPattern=' + this.get('selectedPattern') + ';pValueThreshold=0.01;signTestBaselineShift=0.0;signTestBaselineLift=0.90;baseline=w/4wAvg;decayRate=0.5;signTestStepSize=1'
      };

      // If these two conditions are true, we assume the user wants to edit an existing alert group
      const isAlertGroupEditModeActive = this.get('showAlertGroupEdit') && this.selectedConfigGroup;
      // A reference to whichever 'alert config' object will be sent. Let's default to the new one
      let finalConfigObj = newConfigObj;
      let newFunctionId = 0;

      // First, save our new alert function
      this.saveThirdEyeFunction(newFunctionObj).then(functionResult => {
        // Add new email recipients if we are dealing with an existing Alert Group
        if (isAlertGroupEditModeActive) {
          let recipientsArr = [];
          if (this.selectedConfigGroup.recipients.length) {
            recipientsArr = this.selectedConfigGroup.recipients.split(',');
          }
          recipientsArr.push(this.alertGroupNewRecipient);
          this.selectedConfigGroup.recipients = recipientsArr.join();
          finalConfigObj = this.selectedConfigGroup;
        }
        // Add our new Alert Function Id to the Alert Config Object
        if (Ember.typeOf(functionResult) === 'number') {
          newFunctionId = functionResult;
          finalConfigObj.emailConfig.functionIds.push(newFunctionId);
        }
        // Finally, save our Alert Config Group
        this.saveThirdEyeEntity(finalConfigObj, 'ALERT_CONFIG').then(alertResult => {
          if (alertResult.ok) {
            this.set('selectedGroupRecipients', finalConfigObj.recipients);
            this.set('isCreateSuccess', true);
            this.set('finalFunctionId', functionResult);
            this.prepareFunctions(finalConfigObj, newFunctionId).then(functionData => {
              this.set('selectedGroupFunctions', functionData);
            });
            this.triggerReplay(newFunctionObj, finalConfigObj, newFunctionId).then(result => {
              console.log('done with replay : ', result);
              this.set('replayStatus', result);
            });
          }
        });
      });
    }
  }
});
