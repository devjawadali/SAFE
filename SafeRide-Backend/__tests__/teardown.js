const { closePool } = require('../config/database');

module.exports = async () => {
  try {
    // Close database connection pool
    await closePool();
    
    // Small delay to allow pending operations to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('✅ Test teardown completed');
  } catch (error) {
    console.error('⚠️  Error during test teardown:', error.message);
    // Don't fail the test run if teardown has issues
  }
};


