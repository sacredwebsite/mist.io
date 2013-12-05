define('app/controllers/monitoring', [
    'ember'
    ],
    /**
     * Monitoring Controller
     *
     * @returns Class
     */
    function() {
        return Ember.ObjectController.extend({

            machine : null,
            machineNotResponding: false,
            lastMeasurmentTime: null,
            view: null,

            step: 0,

            // This one is called from view
            initController: function(machine,view){
                this.machine = machine;
                this.view = view;
            },

            /**
            * Method: setupDataRequest
            * Receives first data and set time interval for
            * next reuqests
            */
            setupDataRequest: function(timeToRequestms,step){

                var SECONDS_INTERVAL = 10000;

                var self = this;
                var timeGap = 60;


                // First Data Request
                self.machine.set('pendingStats', true);

                var stop = (new Date()).getTime() - timeGap * 1000;
                var start = stop - timeToRequestms;
                self.step = step;


                console.log("Stop: " + (new Date(stop)));
                console.log("Start: " + (new Date(start)));
                self.receiveData(start, stop, self.step);


                // Update Request Every SECONDS_INTERVAL miliseconds
                window.monitoringInterval = window.setInterval(function() {

                    var start = (new Date()).getTime() - (timeGap+10) * 1000;
                    var stop =  (new Date()).getTime() - timeGap * 1000; 

                    // Ask all the datat that we didn't receive
                    if(self.machineNotResponding){

                        // Get last time from a graph
                        if(self.lastMeasurmentTime.getTime() < start)
                            start = self.lastMeasurmentTime.getTime();

                        machineNotResponding = false;
                    }

                    self.receiveData(start, stop, self.step);

                },SECONDS_INTERVAL);
            },

            updateDataRequest: function(timeToRequestms,step){
                window.clearInterval(window.monitoringInterval);
                this.setupDataRequest(timeToRequestms,step);
            },

            finishedGraphUpdate: function(){
                // Runs After All Graphs Are Updated
                // Do Some Stuff Here                
            },


            /**
            * Method: receiveData
            * Makes an ajax request to served, receives measurements
            * creates custom data objects and updates graphs
            */
            receiveData: function(start,stop,step){

                var self = this;

                // start: date/time we want to receive data from
                // stop:  date/time we want to receeive data until
                // step:  miliseconds we want to split data
                $.ajax({
                    url: URL_PREFIX + '/backends/' + this.machine.backend.id +
                         '/machines/' + this.machine.id + '/stats',
                    type: 'GET',
                    async: true,
                    dataType: 'jsonp',
                    data: {'start': Math.floor(start / 1000), 
                            'stop': Math.floor(stop / 1000),
                            'step': step,
                            'auth_key': Mist.auth_key},
                    timeout: 8000,
                    success: function (data, status, xhr){
                        
                        var controller = Mist.monitoringController;

                        try {

                            var measurmentsExpected = Math.floor((stop-start) / step) ;

                            if(data.load.length == 0)
                                throw "Error, Received none measurements";
                            else if(data.load.length > measurmentsExpected)
                                throw "Error, Received more measurements than expected";

                            console.log("Measurement Expected: " + measurmentsExpected);
                            console.log("Measurement Received: " + data.load.length);

                            var disks = [];
                            var netInterfaces = [];

                            // Get Disks Names
                            for(disk in data['disk']['read'])
                            {
                                disks.push(disk);
                            }

                            // Get Network Interfaces Names
                            for(netInterface in data['network'])
                            {
                                 netInterfaces.push(netInterface);
                            }


                            var receivedData = {
                                cpuCores:   0,
                                cpu:       [],
                                load:      [],
                                memory:    [],
                                diskRead:  [],
                                diskWrite: [],
                                netRX:     [],
                                netTX:     []
                            };
                            console.log("Received: " + data.load.length + " measurements");
                            console.log("Step:" + step);


                            // Set CPU Cores
                            receivedData.cpuCores =  data['cpu']['cores'];

                            // Create a date with first measurement time
                            var metricTime = new Date(start);

                            // Create Custom Objects From Data
                            for(var i=0; i < data.load.length; i++ )
                            {
                                // DD/MM/YY-HH:MM:SS
                                var measurementTime = metricTime.getDate()      + "/" + 
                                                      (metricTime.getMonth()+1) + "/" +
                                                      metricTime.getFullYear()  + "-" +
                                                      metricTime.getHours()     + ":" + 
                                                      metricTime.getMinutes()   + ":" + 
                                                      metricTime.getSeconds();

                                var cpuObj = {
                                    time : measurementTime,
                                    value: ( (data['cpu']['utilization'][i] * data['cpu']['cores']) * 100)
                                };
                                var loadObj = {
                                    time : measurementTime,
                                    value: data['load'][i]
                                };
                                var memObj = {
                                    time : measurementTime,
                                    value: data['memory'][i]
                                };

                                // TODO Add Multiple Disks
                                var diskReadObj = {
                                    time: measurementTime,
                                    value: data['disk']['read'][disks[0]]['disk_octets'][i]
                                };
                                var diskWriteObj = {
                                    time: measurementTime,
                                    value: data['disk']['write'][disks[0]]['disk_octets'][i]
                                };

                                // TODO Add Multiple Interfaces
                                var netRXObj = {
                                    time: measurementTime,
                                    value: data['network'][netInterfaces[0]]['rx'][i]
                                };
                                var netTXObj = {
                                    time: measurementTime,
                                    value: data['network'][netInterfaces[0]]['tx'][i]
                                };

                                // Push Objects Into Data Object
                                receivedData.cpu.push(cpuObj);
                                receivedData.load.push(loadObj);
                                receivedData.memory.push(memObj);
                                receivedData.diskRead.push(diskReadObj);
                                receivedData.diskWrite.push(diskWriteObj);
                                receivedData.netRX.push(netRXObj);
                                receivedData.netTX.push(netTXObj);

                                // Increase time by step for every new measurement
                                metricTime = new Date(metricTime.getTime()+10000);
                            }

                            controller.machine.set('pendingStats', false);
                            self.lastMeasurmentTime = new Date(metricTime.getTime()-10000);
                            self.view.updateGraphs(receivedData);
                            self.finishedGraphUpdate();
                        }
                        catch(err) {
                            Mist.notificationController.notify(err);
                            error(err);
                            self.machineNotResponding = true;
                        }

                    },
                    error: function(jqXHR, textStatus, errorThrown) {
                        
                        if(errorThrown == 'timeout'){

                            // When monitoring is disabled ajax call may be still run one time.
                            // So we won't display error if it is disabled
                            if(self.machine.hasMonitoring){
                                Mist.notificationController.timeNotify("Data request timed out. " +
                                                                       "Internet is down or server doesn't respond",4000);

                                self.machineNotResponding = true;
                            }
                        }
                        else{
                            Mist.notificationController.timeNotify("An error occurred while retrieving data",4000);
                        };
                    }
                });
            }
        })
    }
);
